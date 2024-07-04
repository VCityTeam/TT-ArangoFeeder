var http = require('http');
var https = require('https');
var url = require('url');
var fs = require('fs');
var arangojs = require('arangojs');
//var aql = require('arangojs/aql');
var aql = require('arangojs').aql;
var config = require('./config.js');
var dbaccess = require('./dbaccess.js');

// 1. Connect to the database and get the thesauri collection
const db = arangojs({
  url: dbaccess.dburl,
  databaseName: dbaccess.database
});

db.useBasicAuth(dbaccess.login, dbaccess.pwd);

db._connection._agentOptions.maxSockets = 8;

var thesauri = db.collection("Thesauri");
var intraThesoRelations = db.collection(config.collections.intraThesoRelations.name);


let listThesauri = thesauri.all().then(
  cursor => cursor.all()
).then(
  res => {
    tmp(res); //linkAllThesauri
  }
)

// Liste les paires possibles à partir d'un array
let getPairs = (arr) => arr.map( (v, i) => arr.slice(i + 1).map(w => [v, w]) ).flat();



async function tmp(thesauri){
  let thCollecs = [];

  // array avec le nom des thesauri disponible dans ma BDD
  let thNames = thesauri.map(t => t._key);
  thNames.forEach((name) => { thCollecs[name] = db.collection(name)});

  let pairs = getPairs(thNames);

  for (let k=0; k<pairs.length; k++){
    let pair = pairs[k];
    const collecA = thCollecs[pair[0]];
    const collecB = thCollecs[pair[1]];

    const cursor = await db.query(aql`
      FOR a IN ${collecA}
        FOR b IN ${collecB}
          RETURN {
            first: a,
            second: b,
            }
      `);
    const result = await cursor.all();

    result.forEach((item, i) => {
      if(i == result.length){
        console.log (" LAAAAAAAAAASSSTTTTT ");
      }
      let nameA = item.first.name.replace(/[&\/\\#,+()$~%.:*?<>{}]/g, '');
      let nameB = item.second.name.replace(/[&\/\\#,+()$~%.:*?<>{}]/g, '');
      console.log(nameA, nameB);

      let regA = new RegExp('\\b' + nameA + '\\b');
      let regB = new RegExp('\\b' + nameB + '\\b');

      let found_AinB = regA.test(nameB); // false
      let found_BinA = regB.test(nameA); // false

      let toSave = [];

      if(found_AinB && nameA.length > 3 && nameB.length > 3){
        console.log(nameA + " inside " + nameB + " ? " + found_AinB);
        //toSave.push({_from: `${item.first._id}`, _to: `${item.second._id}`, type: 'related to', provenance: 'internal calculation'});
      }

      if(found_BinA && nameA.length > 3 && nameB.length > 3){
        console.log(nameB + " inside " + nameA + " ? " + found_BinA);
        //toSave.push({_from: `${item.second._id}`, _to: `${item.first._id}`, type: 'related to', provenance: 'internal calculation'});
      }
    });

  }



  //const cursor = await db.query(aql`FOR a IN th13 RETURN a`);
  //const result = await cursor.all();

  /*
  pairs.forEach(pair => {
  //let pair = pairs[0];
    const collecA = thCollecs[pair[0]];
    const collecB = thCollecs[pair[1]];

    const result = db.query({
      query: `
      FOR a IN @@collecA
          FOR b IN @@collecB
              //FILTER CHAR_LENGTH(a.name) > 3 AND CHAR_LENGTH(b.name) > 3
                  RETURN {
                      first: a,
                      second: b,
                  }
      `,
      bindVars: {
        "@collecA": collecA.name,
        "@collecB": collecB.name
      }
    }).then(
      cursor => cursor.all()
    ).then(
      res => {
        res.forEach((item, i) => {
          if(i == res.length){
            console.log (" LAAAAAAAAAASSSTTTTT ");
          }
          let nameA = item.first.name;
          let nameB = item.second.name;
          let regA = new RegExp('\\b' + nameA + '\\b');
          let regB = new RegExp('\\b' + nameB + '\\b');

          let found_AinB = regA.test(nameB); // false
          let found_BinA = regB.test(nameA); // false

          let toSave = [];

          if(found_AinB && nameA.length > 3 && nameB.length > 3){
            console.log(nameA + " inside " + nameB + " ? " + found_AinB);
            toSave.push({_from: `${item.first._id}`, _to: `${item.second._id}`, type: 'related to', provenance: 'internal calculation'});
            // intraThesoRelations.save({_from: `${item.first._id}`, _to: `${item.second._id}`, type: 'related to', provenance: 'internal calculation'}).then(
            //   meta => console.log(meta),
            //   err => console.error('Failed: ', err)
            // );

          }

          if(found_BinA && nameA.length > 3 && nameB.length > 3){
            console.log(nameB + " inside " + nameA + " ? " + found_BinA);
            toSave.push({_from: `${item.second._id}`, _to: `${item.first._id}`, type: 'related to', provenance: 'internal calculation'});

          //   intraThesoRelations.save({_from: `${item.second._id}`, _to: `${item.first._id}`, type: 'related to', provenance: 'internal calculation'}).then(
          //     meta => console.log(meta),
          //     err => console.error('Failed: ', err)
          //   );
          }


          //console.log(item.first.name)
        });

      }
    );

  });
  */



}
