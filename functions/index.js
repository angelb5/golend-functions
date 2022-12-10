/* eslint-disable require-jsdoc */
const functions = require("firebase-functions");
const admin = require("firebase-admin");
const axios = require("axios");
admin.initializeApp();

const db = admin.firestore();

// // Create and Deploy Your First Cloud Functions
// // https://firebase.google.com/docs/functions/write-firebase-functions
exports.addOneToMarca = functions.firestore
    .document("devices/{deviceId}")
    .onCreate((snap, context) => {
      // Get an object representing the document
      // e.g. {'name': 'Marie', 'age': 66}
      const marca = snap.data().marca;
      const marcasRef = db.collection("others").doc("marcas");
      let found = false;
      return marcasRef.get().then((doc) => {
        const json = doc.data();
        Object.keys(json).forEach((marcaKey) => {
          if (!found && marcaKey.toLowerCase() == marca.toLowerCase()) {
            found = true;
            // eslint-disable-next-line max-len
            return marcasRef.update(marcaKey, parseInt(json[marcaKey])+1);
          }
        });
        if (!found) {
          console.log("No se encontro, deberia crear otra marca");
          return marcasRef.set({[marca]: 1}, {merge: true});
        }
      }).then( (snapshot) =>{
        return "success";
      }).catch(() => {
        return "error";
      });
    });

exports.subsOneFromMarca = functions.firestore
    .document("devices/{deviceId}")
    .onDelete((snap, context) => {
      // Get an object representing the document
      // e.g. {'name': 'Marie', 'age': 66}
      const marca = snap.data().marca;
      const marcasRef = db.collection("others").doc("marcas");
      return marcasRef.get().then(function(doc) {
        const json = doc.data();
        let found = false;
        Object.keys(json).forEach((marcaKey) => {
          if (!found && marcaKey.toLowerCase() == marca.toLowerCase()) {
            found = true;
            return marcasRef.update(marcaKey, parseInt(json[marcaKey])-1);
          }
        });
        if (!found) {
          return null;
        }
      }).then( (snapshot) =>{
        return "success";
      }).catch(() => {
        return "error";
      });
    });

exports.updateMarca = functions.firestore
    .document("devices/{deviceId}")
    .onUpdate((change, context) => {
      // Get an object representing the document
      // e.g. {'name': 'Marie', 'age': 66}
      const oldMarca = change.before.data().marca;
      const newMarca = change.after.data().marca;
      if (oldMarca.toLowerCase() == newMarca.toLowerCase()) return null;

      const marcasRef = db.collection("others").doc("marcas");
      return marcasRef.get().then(function(doc) {
        const batch = db.batch();
        const json = doc.data();
        let found = false;
        Object.keys(json).forEach((marcaKey) => {
          if (!found && marcaKey.toLowerCase() == newMarca.toLowerCase()) {
            found = true;
            // eslint-disable-next-line max-len
            batch.update(marcasRef, marcaKey, parseInt(json[marcaKey])+1);
          }
          if (marcaKey.toLowerCase() == oldMarca.toLowerCase()) {
            batch.update(marcasRef, marcaKey, parseInt(json[marcaKey])-1);
          }
        });
        if (!found) {
          console.log("No se encontro, deberia crear otra marca");
          batch.update(marcasRef, newMarca, 1);
        }
        return batch.commit();
      }).then( (snapshot) =>{
        return "success";
      }).catch(() => {
        return "error";
      });
    });

exports.getMarcas = functions.https.onRequest((request, response) => {
  const marcasRef = db.collection("others").doc("marcas");
  marcasRef.get().then(function(doc) {
    if (doc.exists) {
      const json = doc.data();
      const marcas = [];
      Object.keys(json).forEach((name) => {
        if (parseInt(json[name])>0) {
          marcas.push(name);
        }
      });
      response.status(200).send({marcas: marcas});
    } else {
      // doc.data() will be undefined in this case
      response.status(500).send({error: "No se encontró el documento"});
    }
  }).catch(function(error) {
    response.status(500).send({error: "No se encontró el documento"});
  });
});

exports.syncReservasDevice = functions.firestore
    .document("devices/{id}")
    .onUpdate(async (change, context) => {
      // Get value of the newly added rating
      const id = context.params.id;
      const newPhotoUrl = change.after.data().fotosUrl[0];
      const newMarca = change.after.data().marca;
      const newModelo = change.after.data().modelo;

      const query = db.collection("reservas").where("device.uid", "==", id);
      const snapshot = await query.get();

      const batch = db.batch();
      snapshot.docs.forEach((doc) => {
        batch.update(doc.ref, {
          "device.fotoPrincipal": newPhotoUrl,
          "device.marca": newMarca,
          "device.modelo": newModelo,
        });
      });
      await batch.commit();
    });

exports.syncReservasUser = functions.firestore
    .document("users/{uid}")
    .onUpdate(async (change, context) => {
      // Get value of the newly added rating
      const permisos = change.before.data().permisos;
      const uid = context.params.uid;
      const newAvatarUrl = change.after.data().avatarUrl;
      const newNombre = change.after.data().nombre;

      if (permisos == "Cliente") {
        return new Promise((resolve, reject) => {
          // eslint-disable-next-line max-len
          updateReservasClienteBatch(uid, newAvatarUrl, newNombre, resolve).catch(reject);
        });
      } else if (permisos == "TI") {
        return new Promise((resolve, reject) => {
          const newCorreo = change.after.data().correo;
          if (change.before.data().correo!=newCorreo) {
            updateCorreo(uid, newCorreo);
          }
          // eslint-disable-next-line max-len
          updateReservasTiBatch(uid, newAvatarUrl, newNombre, resolve).catch(reject);
        });
      }
    });

exports.deleteUser = functions.firestore
    .document("users/{uid}")
    .onDelete(async (snap, context) => {
      const uid = context.params.uid;
      return admin.auth().deleteUser(uid);
    });

exports.sendMail = functions.firestore
    .document("reservas/{reservaId}")
    .onUpdate((change, context) => {
      const id = context.params.reservaId;
      const oldEstado = change.before.data().estado;
      const newEstado = change.after.data().estado;
      if (oldEstado==newEstado) {
        return null;
      }
      return axios.post("http://eureka-eli.brazilsouth.cloudapp.azure.com:8090/api/email/enviarCorreo/"+id);
    });

async function updateCorreo(uid, correo) {
  await admin.auth().updateUser(uid, {email: correo});
}

async function updateReservasClienteBatch(uid, avatarUrl, nombre, resolve) {
  const query = db.collection("reservas").where("clienteUser.uid", "==", uid);
  const snapshot = await query.get();

  const batch = db.batch();
  snapshot.docs.forEach((doc) => {
    batch.update(doc.ref, {
      "clienteUser.avatarUrl": avatarUrl,
      "clienteUser.nombre": nombre,
    });
  });
  await batch.commit();
  resolve();
}

async function updateReservasTiBatch(uid, avatarUrl, nombre, resolve) {
  const query = db.collection("reservas").where("tiUser.uid", "==", uid);
  const snapshot = await query.get();

  const batch = db.batch();
  snapshot.docs.forEach((doc) => {
    batch.update(doc.ref, {
      "tiUser.avatarUrl": avatarUrl,
      "tiUser.nombre": nombre,
    });
  });
  await batch.commit();
  resolve();
}
