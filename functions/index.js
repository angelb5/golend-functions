const functions = require("firebase-functions");
const admin = require("firebase-admin");
admin.initializeApp();

const db = admin.firestore();

// // Create and Deploy Your First Cloud Functions
// // https://firebase.google.com/docs/functions/write-firebase-functions
//
exports.helloWorld = functions.https.onRequest((request, response) => {
  functions.logger.info("Hello logs!", {structuredData: true});
  response.send("Hello from Firebase!");
});

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
