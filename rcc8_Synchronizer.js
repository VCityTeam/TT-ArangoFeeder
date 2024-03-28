var http = require('http');
var https = require('https');
var url = require('url');
var fs = require('fs');
var arangojs = require('arangojs');
var config = require('./config.js');

// 1. Connect to the database and get the nomenclature collection (th56)
const db = arangojs({
  url: config.dburl,
  databaseName: config.database
});

db.useBasicAuth(config.user.login, config.user.pwd);

let thesaurus = "th56";
var nomenclature = db.collection(thesaurus);
var nomenclatureRelations = db.collection(thesaurus+"_relations");


//load RCC8 json data
async function loadJsonData(url){
  try {
    const data = await fs.promises.readFile(url, 'utf8');
    return data;
  } catch (error) {
    return error;
  }
}

async function decodeData(){
  let data = await loadJsonData('./data_12-12-23/RCC8_v1.json');
  let parsedData = JSON.parse(data);
  let entities = Object.entries(parsedData);

  for (const [key, value] of entities){
    let answer = await handleEntity(key, value);
    //console.log(answer);
  }

}

async function handleEntity(key, value){

  const promise = new Promise((resolve) => {

    let prefix = value.toponym.toponym_uri_prefix;
    let slug = value.toponym.toponym_uri_slug;
    let ids = rebuildId(prefix, slug);
    //resolve(ids);

    if(!ids){
      resolve("no ids, are you sure ?");
      // maybe we should create the node, as the concept doesn't exist in collection ?!
      return
    }

    // maybe the concept already exist ?
    // first we check if the DOCUMENT exists in the thesaurus collection
    db.query(`RETURN DOCUMENT('${thesaurus}/${ids.local}')`).then(
      cursor => cursor.all()
    ).then(
      res => {
        // the document doesn't exist in the thesaurus collection :( Should I create it ?? With which ID ?
        if(!res[0]){
          //createDoc();
          //saveDoc
        }
        else{
          // Prepare doc update
          res[0].category = value.category;
          res[0].entity  = value.entity;

          // first we check if the current entity notation is the same than the document mainName
          if(res[0].mainName !== value.entity.entity_notation){
            // if not, we consider the current notation as the best one, so we update the document mainName
            res[0].mainName = value.entity.entity_notation;

            // and also add the new label to the labels list if it is not already present
            if(!isThisLabelListed(res[0].labels, value.entity.entity_notation)){
              res[0].labels.push({"label": value.entity.entity_notation, "lang": "fr"});
            }
          }

          // we also may add the full label in this list, not only the notations...
          if(!isThisLabelListed(res[0].labels, value.entity.entity_label)){
            res[0].labels.push({"label": value.entity.entity_label, "lang": "fr"}); //todo pas forcément en FR
          }

          // the new doc is ready, now we can update it
          nomenclature.update(ids.local, res[0]).then(
            meta => {
              handleRCCrelations(ids.local, value.RCC8);
              resolve(ids.local);
            },
            err => {
              console.error('Failed to update document:', err);
              resolve("an error occured during document update");
            }
          );

        }

      },
      err => console.error('Failed to execute query: ' + err)
    )

  });
  return promise;
}

// this function allows to check if a specific label is already listed in the document possible labels
// object array
// string
function isThisLabelListed(labelsList, labelToFind){
  let results = labelsList.filter(obj => obj.label == labelToFind);
  if(results.length == 0){
    return false;
  }
  else{
    return true;
  }
}

// this function allows to build arkID and arango key from Anais toponym data
function rebuildId(uriPrefix, uriSlug){
  if(!uriPrefix || !uriSlug){
    return null;
  }
  else{
    let arkId = uriPrefix + uriSlug;
    let split = arkId.split("/");
    let localID = split[split.length-1];
    return {"ark": arkId, "local": localID};
  }
}

function handleRCCrelations(id, rcc){

  for (const [key, value] of Object.entries(rcc)){
    upperKey = key.toUpperCase();
    switch(upperKey) {
        case "DC":
          findNodeThenCreateRelation(id, value, "disjoints");
          break;

        case "EC":
          findNodeThenCreateRelation(id, value, "touches");
          break;

        case "PO":
          findNodeThenCreateRelation(id, value, "overlaps");
          break;

        case "EQ":
          findNodeThenCreateRelation(id, value, "equals");
          break;

        case "TPP":
          findNodeThenCreateRelation(id, value, "tangential proper part");
          // x TPP y <=> y nTPP x so we must add a function able to
          // 1. find the ID of the ending node (from "value")
          // 2. use it as starting node of the non-TPP relation
          createNonRelation(id, value, "non-tangential proper part");
          break;

        case "TPPI":
          findNodeThenCreateRelation(id, value, "tangential proper part inverse");
          // x TPPi y <=> y nTPPi x so we must add a function able to
          // 1. find the ID of the ending node (from "value")
          // 2. use it as starting node of the non-TPPi relation
          createNonRelation(id, value, "non-tangential proper part inverse");
          break;

        case "NTPP":
          findNodeThenCreateRelation(id, value, "non-tangential proper part");
          // x nTPP y <=> y TPP x so we must add a function able to
          // 1. find the ID of the ending node (from "value")
          // 2. use it as starting node of the TPP relation
          createNonRelation(id, value, "tangential proper part");
          break;

        case "NTPPI":
          findNodeThenCreateRelation(id, value, "non-tangential proper part inverse");
          // x nTPP y <=> y TPP x so we must add a function able to
          // 1. find the ID of the ending node (from "value")
          // 2. use it as starting node of the TPPi relation
          createNonRelation(id, value, "tangential proper part inverse");
          break;

        default:
          console.log("unknown RCC8 relation type");
        break;
      }
  }
}

/**
* Find a document by its label and add relation. Basically, this function is used to build non relations
* i.e. x TPPi y <=> y nTPPi x
* idTo : id of the ending node (already known)
* labelFrom : label of the starting node (must be used to find the starting node ID)
* relation type : type of the relation linking starting node to ending node.
**/
function createNonRelation(idTo, labelsFrom, relationType){
  for (let i=0; i<labelsFrom.length; i++){
    let label = labelsFrom[i];
    console.log("First : find the doc id from this label: " + label);

    db.query(`LET byname = FIRST(
          FOR doc IN ${thesaurus} FILTER doc.mainName == "${label}" RETURN doc._key
          )

      LET bylabel = FIRST(
          FOR doc IN ${thesaurus}
              FOR entry IN doc.labels
                  FILTER entry.label == "${label}" LIMIT 1 RETURN doc._key
          )

      RETURN byname || bylabel`).then(
      cursor => cursor.all()
    ).then(
      docs => {
        // if we succeded to find the ending node by its label, we can try to create the relation
        if(docs[0] !== null){
          //console.log(docs[0]);
          console.log("FROM " + thesaurus + "/" + docs[0] + " TO " + thesaurus + "/" + idTo);
          nomenclatureRelations.save({_from: `${thesaurus}/${docs[0]}`, _to: `${thesaurus}/${idTo}`, type: `${relationType}`}).then(
            meta => console.log(meta),
            err => console.error('Failed: ', err)
          );
        }
        else{
          console.log("cannot find " + label + " in th56...");
        }
      },
      err => console.error('Failed to execute query:', err)
    );

  }
}

/* Find documents key from their label and add relations */
// idFrom : the id of the starting node
// labelsTo : the labels of the entities that must be connected to the starting node (we have to find their corresponding nodes in the DB collections to get the ending nodes)
// relationType : type of the relation from starting node to ending node (ex: RCC8 disjoints)
function findNodeThenCreateRelation(idFrom, labelsTo, relationType){

  // 1. We need to find de ending nodes from their respective label
  for (let i=0; i<labelsTo.length; i++){
    let label = labelsTo[i];

    console.log("First : find the doc id from this label: " + label);
    db.query(`LET byname = FIRST(
          FOR doc IN ${thesaurus} FILTER doc.mainName == "${label}" RETURN doc._key
          )

      LET bylabel = FIRST(
          FOR doc IN ${thesaurus}
              FOR entry IN doc.labels
                  FILTER entry.label == "${label}" LIMIT 1 RETURN doc._key
          )

      RETURN byname || bylabel`).then(
      cursor => cursor.all()
    ).then(
      docs => {
        // if we succeded to find the ending node by its label, we can try to create the relation
        if(docs[0] !== null){
          //console.log(docs[0]);
          console.log("FROM " + thesaurus + "/" + idFrom + " TO " + thesaurus + "/" + docs[0]);
          // createRelation from idFrom to docs[0];
          nomenclatureRelations.save({_from: `${thesaurus}/${idFrom}`, _to: `${thesaurus}/${docs[0]}`, type: `${relationType}`}).then(
            meta => console.log(meta),
            err => console.error('Failed: ', err)
          );

        }
        else{
          console.log("cannot find " + label + " in th56...");
        }
      },
      err => console.error('Failed to execute query:', err)
    );


  }




}


function findIdFromLabel(label){
  console.log("find the doc id from this label: " + label);
  db.query(`LET byname = FIRST(
        FOR doc IN ${thesaurus} FILTER doc.mainName == "${label}" RETURN doc._key
        )

    LET bylabel = FIRST(
        FOR doc IN ${thesaurus}
            FOR entry IN doc.labels
                FILTER entry.label == "${label}" LIMIT 1 RETURN doc._key
        )

    RETURN byname || bylabel`).then(
    cursor => cursor.all()
  ).then(
    docs => {
      if(docs[0] == null){
        console.log("cannot find " + label + " in th56...");
      }
      else{
        console.log(docs[0]);
      }
    },
    err => console.error('Failed to execute query:', err)
  );
}


decodeData();
