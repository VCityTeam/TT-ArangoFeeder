# TT-ArangoFeeder
Build arangoDB collections from Aioli and OpenTheso data

1) Run PrepareDB.js
2) Run OpenTheso_Synchronizer.js
3) Run Aioli_Synchronizer.js
4) Run rcc8_Synchronizer.js
5) Run SemanticsLinker.js

## Notes

```bash
docker run -e ARANGO_RANDOM_ROOT_PASSWORD=1 -p 8529:8529 -v $(pwd)/Junnk:/var/lib/arangodb3 -d --name arango arangodb/arangodb
docker logs arango | grep "GENERATED ROOT PASSWORD"
```

Retrieve the generated database password out of the previous command and
edit the `dbaccess.js` in order to provide the required credentials
(note: by default the `login` is `root`.

Then create a database named out of the `database` entry you chose to provide
within the `dbaccess.js` file by 
* using the builtin Arangodb UI by opening `http://127.0.0.1:8529` with your
  favorite webbrowser,
* identifying and 
* using the `DATABASES` tab of the dashboard.

Eventually proceed with uploading content to the database by running

```bash
npm i
node PrepareDB.js
node OpenTheso_Synchronizer.js
node Aioli_Synchronizer.js
node rcc8_Synchronizer.js
node SemanticsLinker.js
```
