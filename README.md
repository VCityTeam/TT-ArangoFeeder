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
```
Obtain the generated database password that stands at the first line of the `docker logs contained-d`.
Edit the `dbaccess.js` and update the required elements.
```bash
npm i
node PrepareDB.js
node OpenTheso_Synchronizer.js
node Aioli_Synchronizer.js
node rcc8_Synchronizer.js
node SemanticsLinker.js
```
