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

var semanticLinks = db.collection("SemanticLinks");
var aioliObjects = db.collection("aioli_objects");
var thesauri = db.collection("Thesauri");

// pour specifier les thesauri qui nous intéressent
var interestingThesauri = ["th13", "th15", "th16", "th56", "th57", "th58"] //["th56"];
//var interestingThesauri = ["th13", "th18", "th52", "th53", "th56", "th12", "th21"];

// on créé un tableau qui va regrouper tous les termes de vocabulaire possible
// il sera de la forme terms[] = [[th, key1, voc1], [th, key2, voc2], ...]
var terms = [];

// d'abord on liste les thesauri disponibles
thesauri.all().then(
  cursor => cursor.map(doc => doc._key)
).then(
  // ensuite pour chaque theso on va créer un sous-tableau
  th => handleThesauri(th),
  err => console.error('Failed to fetch all documents:', err)
);

// pour chaque theso, on va aller chercher la collection correspondante dans la BDD pour récupérer ses élements de vocabulaire
function handleThesauri(th){
  th.forEach((item, index) => {

    // pour ne chercher des liens qu'avec les thesauri qu'on autorise
    // if(interestingThesauri.indexOf(item) < 0){
    //   console.log(item + " not found in authorized thesauri");
    //   return;
    // }
    console.log(item + " is in authorized thesauri");

    let t = db.collection(item);

    t.all().then(
      cursor => cursor.map(doc => [item, doc._key, doc.mainName])
    ).then(
      //names => pushTerms(names), //item, names
      names => {
        if(interestingThesauri.indexOf(item) > -1){
          pushTerms(names)
        }
      },
      err => console.error('Failed to fetch all documents:', err)
    ).then(
      // c'est le dernier theso, donc maintenant qu'on a accumulé tout le vocabulaire
      // on va pouvoir chercher des liens avec les projets aioli
      v => {
        if(index == th.length - 1){
          console.log(item + " is last !");
          console.log(terms)

          findSemanticsInRegions();
          /*findSemanticsInProjectsNames();*/

        }
      }
    )

  });
}

// cette fonction permet juste d'ajouter un terme dans le sous tableau correspondant au bon thesaurus
function pushTerms(term){
  term.forEach(voc => {
    terms.push(voc);
  })
}



function findSemanticsInRegions(){
  db.query('FOR d IN aioli_objects FILTER d.type == "Region" AND d.description RETURN d').then(
    cursor => cursor.all()
  ).then(
    docs => linkRegDescriptions(docs),
    err => console.error('Failed to execute query:', err)
  );

}

function linkRegDescriptions(regs){
  //console.log(terms[0])

  regs.forEach(reg => {

    for (const [k, value] of Object.entries(reg.description)) {
      //console.log(`${k}: ${value}`);
      //console.log(value);

      for(let key in terms){
        //console.log(key);
        let val = value.toString().replace(/[^a-zA-Z0-9 ]/g, "").toLowerCase();
        let voc = " " + terms[key][2] + " ";
        voc = voc.replace(/[^a-zA-Z0-9 ]/g, "").toLowerCase();
        //console.log("VOC");
        //console.log(voc);
        //console.log(voc.replace(/[^a-zA-Z0-9 ]/g, "").toLowerCase());

        if(voc.length > 3  && isNaN(voc) && val.indexOf(voc) > -1){
          console.log(terms[key][2] + ' IS IN ' + value + " !!!");
          console.log("\n");
          console.log(" FROM " + `aioli_objects/${reg._key}` + " TO " + `${terms[key][0]}/${terms[key][1]}`);

          semanticLinks.save({_from: `aioli_objects/${reg._key}`, _to: `${terms[key][0]}/${terms[key][1]}`, nature: 'vocabulary'}).then(
            meta => console.log(meta),
            err => console.error('Failed: ', err)
          );
        }

      }

    }

  });
}

/*
function findSemanticsInProjectsNames(){
  db.query('FOR d IN aioli_objects FILTER d.type == "Project" RETURN d').then(
    cursor => cursor.all()
  ).then(
    docs => linkProjectNames(docs),
    err => console.error('Failed to execute query:', err)
  );
}

function linkProjectNames(projects){
  projects.forEach(project => {
    console.log(project.name);

      for(let key in terms){
        // enlever tous les Espaces
        // remplacer les accents par des lettres sans accent au lieu de les supprimer
        let val = project.name.replace(/[^a-zA-Z0-9]/g, "");//.toLowerCase(); // je compare en étant case sensitive pour etre assez flex pour la nomenclature
        let voc = terms[key][2];
        voc = voc.replace(/[^a-zA-Z0-9]/g, "");//.toLowerCase();

        if(voc.length > 2 && isNaN(voc) && val.indexOf(voc) > -1){ //&& isNaN(voc)
          console.log(terms[key][2] + ' IS IN ' + project.name + " !!!");
          console.log("\n");
          console.log(" FROM " + `aioli_objects/${project._key}` + " TO " + `${terms[key][0]}/${terms[key][1]}`);

          // semanticLinks.save({_from: `aioli_objects/${reg._key}`, _to: `${terms[key][0]}/${terms[key][1]}`, nature: 'vocabulary'}).then(
          //   meta => console.log(meta),
          //   err => console.error('Failed: ', err)
          // );
        }

      }
  });
}
*/
