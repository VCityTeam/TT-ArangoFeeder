var http = require('http');
var https = require('https');
var url = require('url');
var fs = require('fs');
var arangojs = require('arangojs');
var config = require('./config.js');
var dbaccess = require('./dbaccess.js');

// 1. Connect to the database and get the thesauri collection
const db = arangojs({
  url: dbaccess.dburl,
  databaseName: dbaccess.database
});

db.useBasicAuth(dbaccess.login, dbaccess.pwd);

var thesauri = db.collection("Thesauri");

//load openTheso data
async function loadOTData(url){
  try {
    const data = await fs.promises.readFile(url, 'utf8');
    return data;
  } catch (error) {
    return error;
  }
}

async function handleConceptScheme(key, value){
  const promise = new Promise ((resolve) => {
    let type = value["http://www.w3.org/1999/02/22-rdf-syntax-ns#type"][0]["value"];
    let abType = type.split('#')[1]; // type abrégé
    let label = value["http://www.w3.org/2004/02/skos/core#prefLabel"][0]["value"];
    // on recupère le nom abrégé du thesaurus
    let url = key.split("/");
    let id = url[url.length-1];

    // on verifie d'abord si le DOCUMENT correspondant à ce theso existe déjà dans la liste des thesauri
    db.query(`RETURN DOCUMENT('Thesauri/${id}')`).then(
      cursor => cursor.all()
    ).then(
      res => {
        // on récupère la liste de ses labels dans toutes les langues disponibles
        let labels = [];
        for (var i=0; i<value["http://www.w3.org/2004/02/skos/core#prefLabel"].length; i++){
          let lbl = {
            label: value["http://www.w3.org/2004/02/skos/core#prefLabel"][i]["value"],
            lang: value["http://www.w3.org/2004/02/skos/core#prefLabel"][i]["lang"]
          }
          labels.push(lbl);
        }

        let hex = "#" + ((1 << 24) * Math.random() | 0).toString(16).padStart(6, "0");
        // on crée un document pour stocker les infos du thesaurus
        let doc = {
          _key: id,
          labels: labels,
          contributor: value["http://purl.org/dc/terms/contributor"] ? value["http://purl.org/dc/terms/contributor"][0]["value"] : "undefined",
          created: value["http://purl.org/dc/terms/created"] ? value["http://purl.org/dc/terms/created"][0]["value"] : "undefined",
          creator: value["http://purl.org/dc/terms/creator"] ? value["http://purl.org/dc/terms/creator"][0]["value"] : "undefined",
          modified: value["http://purl.org/dc/terms/modified"] ? value["http://purl.org/dc/terms/modified"][0]["value"] : "undefined",
          color: hex
        }

        if(!res[0]){
          // le document (fiche de ce thesaurus) n'existe pas;
          thesauri.save(doc).then(
            meta => console.log('Document saved:', meta._rev),
            err => console.error('Failed to save document:', err)
          )
        }
        else{
          // le document (fiche de ce thesaurus) existe deja on doit le mettre a jour;
          thesauri.update(id, doc).then(
            meta => console.log('Document updated:', meta._rev),
            err => console.error('Failed to update document:', err)
          );
        }
      },
      err => console.error('Failed to execute query: ', err)
    ).then(
      // On verifie ensuite si la COLLECTION correspondant au thesaurus existe
      // Pour ça on liste les collections de la BDD
      db.listCollections().then(
        collections => collections.map(coll => coll.name)
      ).then(
        // et ensuite on regarde si parmi les noms de collections on trouve celle qui nous intéresse
        names => {
          // si oui, la collection du thesaurus existe, on l'utilisera pour insérer nos concepts
          if(names.includes(id)){
            console.log("the collection already exists");
            resolve("miaou");
          }
          // si non, il faut la créer pour ensuite pouvoir insérer nos concepts
          else{
            //db.collection(id).create().then(
            db.createCollection(id).then(
              () => {
                console.log('Node collection created');
                // Type 3 = pour créer une collection de type EDGE
                //let relations = db.collection(`${id}_relations`).create({ type: 3 }).then(
                let relations = db.createEdgeCollection(`${id}_relations`).then(
                  () => {
                    resolve("relations collection created");
                  });
              },
              err => console.log('Failed to create the collection: ', err)
            );
          }
        }
      )
    );

  });
  return promise;
}

async function handleCollections(key, value){
  const promise = new Promise ((resolve) => {
    // on recupère le nom abrégé du thesaurus
    let id = key.split("idg=")[1].split("&")[0];
    let idTheso = key.split("idt=")[1];
    // on verifie d'abord si le DOCUMENT correspondant à cette collection existe déjà dans le thesaurus
    db.query(`RETURN DOCUMENT('${idTheso}/${id}')`).then(
      cursor => cursor.all()
    ).then(
      res => {

        // TODO vérifier avant si la colleciton du theso parent existe ?


        // on récupère la liste de ses labels dans toutes les langues disponibles
        let labels = [];
        for (var i=0; i<value["http://www.w3.org/2004/02/skos/core#prefLabel"].length; i++){
          let lbl = {
            label: value["http://www.w3.org/2004/02/skos/core#prefLabel"][i]["value"],
            lang: value["http://www.w3.org/2004/02/skos/core#prefLabel"][i]["lang"]
          }
          labels.push(lbl);
        }

        let notation = "";
        if(value["http://www.w3.org/2004/02/skos/core#notation"]){
          notation = value["http://www.w3.org/2004/02/skos/core#notation"][0]["value"];
        }

        // on crée un document pour stocker les infos de la collection
        let doc = {
          _key: id,
          labels: labels,
          type: "Collection",
          created: value["http://purl.org/dc/terms/created"][0]["value"],
          modified: value["http://purl.org/dc/terms/modified"][0]["value"],
          notation: notation,
          name: value["http://www.w3.org/2004/02/skos/core#prefLabel"][0]["value"],
          color: null
        }
        //notation: value["http://www.w3.org/2004/02/skos/core#notation"][0]["value"]
        if(!res[0]){
          // le document n'existe pas;
          db.collection(idTheso).save(doc).then(
            meta => {
              //console.log('Document saved:', meta._rev),
              resolve(id);
            },
            err => console.error('Failed to save document:', err)
          )
        }
        else{
          // le document existe deja on doit le mettre a jour;
          db.collection(idTheso).update(id, doc).then(
            meta => {
              //console.log('Document updated:', meta._rev),
              resolve(id);
            },
            err => console.error('Failed to update document:', err)
          );
        }

      },
      err => console.error('Failed to execute query: ', err)
    )


  });
  return promise;
}

async function handleConcepts(key, value){
  // if an ark id exists, we use it. Else, we must deal with an opentheso local id...
  var id, idTheso, ark;
  if(key.indexOf("ark:") > -1){
    id = key.split("ark:/")[1].split("/")[1];
    ark = key;
    //console.log("ARK ID : " + id);
  }
  else if(value["http://purl.org/dc/terms/identifier"]){
    id = value["http://purl.org/dc/terms/identifier"][0]["value"];
  }
  else {
    id = key.split("idc=")[1].split("&")[0];
  }

  if(value["http://www.w3.org/2004/02/skos/core#inScheme"]){
    let url = value["http://www.w3.org/2004/02/skos/core#inScheme"][0]["value"].split("/");
    idTheso = url[url.length-1];
  }
  else {
    idTheso = key.split("idt=")[1];
  }

  let color = await getColorByTheso("th56");
  //console.log(color[0]);

  const promise = new Promise ((resolve) => {

    /*
    var id, idTheso;
    //console.log("KEY " + key);
    //console.log(key.indexOf("ark:"));

    // if an ark id exists, we use it. Else, we must deal with an opentheso local id...
    var ark;
    if(key.indexOf("ark:") > -1){
      id = key.split("ark:/")[1].split("/")[1];
      ark = key;
      //console.log("ARK ID : " + id);
    }
    else if(value["http://purl.org/dc/terms/identifier"]){
      id = value["http://purl.org/dc/terms/identifier"][0]["value"];
    }
    else {
      id = key.split("idc=")[1].split("&")[0];
    }

    if(value["http://www.w3.org/2004/02/skos/core#inScheme"]){
      let url = value["http://www.w3.org/2004/02/skos/core#inScheme"][0]["value"].split("/");
      idTheso = url[url.length-1];
    }
    else {
      idTheso = key.split("idt=")[1];
    }
    */

    // on verifie d'abord si le DOCUMENT correspondant à ce concept existe déjà dans le thesaurus
    db.query(`RETURN DOCUMENT('${idTheso}/${id}')`).then(
      cursor => cursor.all()
    ).then(
      res => {
        // TODO Vérifier avant si la collection du theso parent existe ?

        // on récupère la liste de ses labels dans toutes les langues disponibles
        let labels = [];
        let name;
        if(value["http://www.w3.org/2004/02/skos/core#prefLabel"]){
          name = value["http://www.w3.org/2004/02/skos/core#prefLabel"][0]["value"];

          for (var i=0; i<value["http://www.w3.org/2004/02/skos/core#prefLabel"].length; i++){
            let lbl = {
              label: value["http://www.w3.org/2004/02/skos/core#prefLabel"][i]["value"],
              lang: value["http://www.w3.org/2004/02/skos/core#prefLabel"][i]["lang"]
            }
            labels.push(lbl);
          }
        }
        else{
          // le concept n'a pas de label !! A la place on va le nommer par son id, faute de mieux...
          name = id;
        }

        //let description = value["http://purl.org/dc/terms/description"][0]["value"].split("##");
        let description = value["http://purl.org/dc/terms/description"] ? value["http://purl.org/dc/terms/description"][0]["value"].split("##") : null;

        let note = null;
        if(value["http://www.w3.org/2004/02/skos/core#scopeNote"]){
          note = value["http://www.w3.org/2004/02/skos/core#scopeNote"][0]["value"];
        }
        let definition = null;
        if(value["http://www.w3.org/2004/02/skos/core#definition"]){
          definition = value["http://www.w3.org/2004/02/skos/core#definition"][0]["value"];
        }


        // on crée un document pour stocker les infos de la collection
        let doc = {
          _key: id,
          labels: labels,
          type: "Concept",
          created: value["http://purl.org/dc/terms/created"] ? value["http://purl.org/dc/terms/created"][0]["value"] : "undefined",
          modified: value["http://purl.org/dc/terms/modified"] ? value["http://purl.org/dc/terms/modified"][0]["value"] : "undefined",
          description: description,
          ark: ark ? ark : undefined,
          //name: value["http://www.w3.org/2004/02/skos/core#prefLabel"][0]["value"]
          name: name,
          note: note,
          definition: definition,
          color: color[0] ? color[0] : null
        }

        if(!res[0]){
          // le document n'existe pas;
          db.collection(idTheso).save(doc).then(
            meta => {
              //console.log('Document saved:', meta._rev),
              resolve(id);
            },
            err => console.error('Failed to save document:', err)
          )
        }
        else{
          // le document existe deja on doit le mettre a jour;
          db.collection(idTheso).update(id, doc).then(
            meta => {
              //console.log('Document updated:', meta._rev),
              resolve(id);
            },
            err => console.error('Failed to update document:', err)
          );
        }

      },
      err => console.error('Failed to execute query: ', err)
    )

    resolve(idTheso);
  });

  return promise;
}

async function handleRelations(key, value){
  const promise = new Promise((resolve) => {
    let id;
    let type = value["http://www.w3.org/1999/02/22-rdf-syntax-ns#type"][0]["value"].split("#")[1];

    // si c'est une collec, on recupere l'id avec l'attribut idg
    if(type == "Collection") {
      id = key.split("idg=")[1].split("&")[0];
    }
    // sinon, c'est avec identifier ou idc
    else {
      //console.log("KEY RELATION " + key);

      if(key.indexOf("ark:") > -1){
        id = key.split("ark:/")[1].split("/")[1];
        console.log("ARK ID: "+ id);
      }
      else if(value["http://purl.org/dc/terms/identifier"]){
        id = value["http://purl.org/dc/terms/identifier"][0]["value"];
      }
      else {
        id = key.split("idc=")[1].split("&")[0];
      }
    }

    let idTheso = key.split("idt=")[1];
    // si malgré ça le idTheso est Undefined, c'est sans doute parce qu'il est exprimé par un ark
    if(!idTheso){
      let url = value["http://www.w3.org/2004/02/skos/core#inScheme"][0]["value"].split("/");
      idTheso = url[url.length-1];
      //console.log(key);
      //console.log(value);
    }

    let narrowers = [];
    if(value["http://www.w3.org/2004/02/skos/core#narrower"]){
      // on récupère l'ID des narrowers. A voir à l'usage si ça pose un pb ou si les id sont bien toujours sous cette forme
      //narrowers = value["http://www.w3.org/2004/02/skos/core#narrower"].map(val => val["value"].split("=")[1].split("&")[0]);
      narrowers = value["http://www.w3.org/2004/02/skos/core#narrower"].map(val => splitStringID(val["value"]));
    }

    let broaders = [];
    if(value["http://www.w3.org/2004/02/skos/core#broader"]){
      // on récupère l'ID des broaders. A voir à l'usage si ça pose un pb ou si les id sont bien toujours sous cette forme
      //broaders = value["http://www.w3.org/2004/02/skos/core#broader"].map(val => val["value"].split("=")[1].split("&")[0]);
      broaders = value["http://www.w3.org/2004/02/skos/core#broader"].map(val => splitStringID(val["value"]));
    }

    let parents = [];
    if(value["http://purl.org/umu/uneskos#memberOf"]){
      // on récupère l'ID des parents. A voir à l'usage si ça pose un pb ou si les id sont bien toujours sous cette forme
      //parents = value["http://purl.org/umu/uneskos#memberOf"].map(val => val["value"].split("=")[1].split("&")[0]);
      parents = value["http://purl.org/umu/uneskos#memberOf"].map(val => splitStringID(val["value"]));
    }

    let related = [];
    if(value["http://www.w3.org/2004/02/skos/core#related"]){
      // on récupère l'ID des related. A voir à l'usage si ça pose un pb ou si les id sont bien toujours sous cette forme
      //related = value["http://www.w3.org/2004/02/skos/core#related"].map(val => val["value"].split("=")[1].split("&")[0]);
      related = value["http://www.w3.org/2004/02/skos/core#related"].map(val => splitStringID(val["value"]));
    }

    // TODO, verifier avant si la collection existe ?
    let thRelations = db.collection(`${idTheso}_relations`);

    // conceptDoc = db.collection(`${idTheso}`).document(`${id}`);

    /*
    for (var i=0; i<narrowers.length; i++){
      thRelations.save({_from: `${idTheso}/${id}`, _to: `${idTheso}/${narrowers[i]}`}).then(
        meta => console.log(meta),
        err => console.error('Failed: ', err)
      );
    }
    */

    for (var i=0; i<narrowers.length; i++){
      thRelations.save({_from: `${idTheso}/${narrowers[i]}`, _to: `${idTheso}/${id}`, type: 'narrower'}).then(
        meta => console.log(meta),
        err => console.error('Failed: ', err)
      );
    }

    //comme narrower mais dans l'autre sens?
    for (var j=0; j<broaders.length; j++){
      //thRelations.save({_from: `${idTheso}/${broaders[j]}`, _to: `${idTheso}/${id}`, toCollection: false}).then(
      thRelations.save({_from: `${idTheso}/${broaders[j]}`, _to: `${idTheso}/${id}`, type: 'broader'}).then(
        meta => console.log(meta),
        err => console.error('Failed: ', err)
      );
    }

    // TODO : A VOIR SI ON DOIT REMETTRE, POUR LES COLLECTIONS
    //memberOf
    // for (var k=0; k<parents.length; k++){
    //   thRelations.save({_from: `${idTheso}/${parents[k]}`, _to: `${idTheso}/${id}`, toCollection: true}).then(
    //   thRelations.save({_from: `${idTheso}/${parents[k]}`, _to: `${idTheso}/${id}`, nature: 'collection'}).then(
    //     meta => console.log(meta),
    //     err => console.error('Failed: ', err)
    //   );
    // }

    //RELATED
    for (var l=0; l<related.length; l++){
      thRelations.save({_from: `${idTheso}/${id}`, _to: `${idTheso}/${related[l]}`, type: 'related'}).then(
        meta => console.log(meta),
        err => console.error('Failed: ', err)
      );
    }

    resolve(".");
  });
  return promise;
}

function splitStringID(value){
  let id;
  if(value.indexOf("=") > 0) {
    id = value.split("=")[1].split("&")[0];
  }
  // else if(value.indexOf(":") > 0) {
  //   id = value.split("ark:/")[1].split("/")[1];
  // }
  else if(value.indexOf("ark:") > 0) {
    id = value.split("ark:/")[1].split("/")[1];
  }
  else{
    console.log(value);
  }
  return id;
}

//decode openTheso data
async function decodeOTdata(file){
  let data = await loadOTData('./data_12-12-23/'+file);
  let th = JSON.parse(data);
  let jsonEntries = Object.entries(th);

  let conceptSchemes = jsonEntries.filter(obj => obj[1]["http://www.w3.org/1999/02/22-rdf-syntax-ns#type"][0]["value"].split("#")[1] == "ConceptScheme");
  let collections = jsonEntries.filter(obj => obj[1]["http://www.w3.org/1999/02/22-rdf-syntax-ns#type"][0]["value"].split("#")[1] == "Collection");
  let concepts = jsonEntries.filter(obj => obj[1]["http://www.w3.org/1999/02/22-rdf-syntax-ns#type"][0]["value"].split("#")[1] == "Concept");

  // on commence par s'occuper des thesauri
  for (const [key, value] of conceptSchemes) {
    let csResponse = await handleConceptScheme(key, value);
    console.log(csResponse);
  }

  // TODO ensuite on s'occupe des collections
  for (const [key, value] of collections) {
    //let id = await handleCollections(key, value);
  }

  //et enfin on s'occupe des concepts
  for (const [key, value] of concepts) {
    let id = await handleConcepts(key, value);
  }


  // quand on est sûrs que toutes les données sont à jour dans la base, on s'occupe des relations qui les lient entre elles
  let collecOrConcept = Object.assign(collections, concepts);
  for (const [key, value] of collecOrConcept) {
    let res = await handleRelations(key, value);
  }

  // TO DO : vérifier si des concepts et des thesauri ont été supprimés entre temps, et si oui les supprimer de la BDD
  console.log("THE END");

}


function getColorByTheso (idTheso){
  return new Promise((resolve, reject) => {
      (async () => {
        try {
          let results = await db.query(`FOR doc IN Thesauri FILTER doc._key == "${idTheso}" RETURN doc.color`).then(cursor => cursor.all());
          return resolve(results);
        } catch (err) {
          return reject(err);
        }
      })()
    });
}

async function loadThesauriFiles(){
  //const listTheso = ["th18", "th52", "th53", "th55"];
  //const listTheso = ["th13", "th18", "th52", "th53", "th56"];
  const listTheso = ["th56"];

  // let arg = await test();
  // console.log(arg[0]);

  //const listTheso = ["th15"];
  /*
  // avec le webservice. Pour l'instant ça ne peut pas marcher car l'export via webservice n'a pas la structure d'un thesaurus complet
  for (let i=0; i<listTheso.length; i++){
    const data = fs.createWriteStream('./data/'+listTheso[i]+'.json');
    https.get('https://opentheso.notre-dame.science/opentheso/api/all/theso?id='+listTheso[i]+'&format=json', rep => {
      rep.pipe(data);
      console.log("done");
    });
    data.on('finish', function(){
      console.log(listTheso[i] + '.json WRITING FINISHED');
      data.end();
      decodeOTdata(listTheso[i] + '.json');
    });
  }
  */
  // sans le webservice
  for (let i=0; i<listTheso.length; i++){
    decodeOTdata(listTheso[i] + '.json');
  }
  console.log("Over");
}
loadThesauriFiles();


// 0. Create server and listen
var server = http.createServer(function (req, res) {

    var url_parts = url.parse(req.url, true);
    var name = url_parts.query.name;
    if (name) {
        console.log('Name: ' +name);
        res.writeHead(200, {'Content-Type': 'application/json'});
        res.end(JSON.stringify({message: 'Hello ' +name + '!'}));
    } else {
        console.log('No name!');
        res.writeHead(200, {'Content-Type': 'text/html'});
        fs.readFile('index.html',function (err,data) {
          res.end(data);
        });
    }

}).listen(1337, '127.0.0.1');
console.log('Server running at http://127.0.0.1:1337/');
