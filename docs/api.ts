/**
 * server setup
 */
import { EleganteServer, EleganteLiveQueryServer } from "@elegante/server";

const elegante = new EleganteServer({
  databaseURI:
    process.env.ELEGANTE_DATABASE_URI ||
    "mongodb://localhost:27017/elegante-dev",
  apiKey: process.env.ELEGANTE_API_KEY || "ELEGANTE_SERVER",
  apiSecret: process.env.ELEGANTE_API_SECRET || "ELEGANTE_SECRET",
  serverURL: process.env.ELEGANTE_SERVER_URL || "http://localhost:3135/server",
  serverHeaderPrefix: process.env.ELEGANTE_SERVER_HEADER_ID || "X-Elegante",
});

const server = express();

server.use("/server", elegante);

const httpServer = http.createServer(server);
httpServer.listen(3135, (port) =>
  console.log("\x1b[33m%s\x1b[0m", `Elegante Server running on port ${port}`)
);

// This will enable the Live Query real-time server
const liveQuery = new EleganteLiveQueryServer({
  collections: ["User", "Etc"],
  websocketTimeout: 5 * 1000,
});

liveQuery.listen(httpServer);

/**
 * queries
 */
import { EleganteQuery } from "@elegante/sdk";

const query = new EleganteQuery();

const users = await query
  .collection("User")
  .projection({
    _id: 0,
    _created_at: 1,
    name: 1,
  })
  .sort({
    _created_at: -1,
  })
  .match({
    name: {
      $in: ["Raul", "Elis"],
    },
  })
  .limit(2)
  .skip(0)
  .allowDiskUse(true)
  .find();

console.log(users);

// to update
// returns an array of updated documents
const usersUpdated = await query
  .collection("User")
  .match({
    name: {
      $in: ["Raul", "Elis"],
    },
  })
  .limit(2)
  .skip(0)
  .allowDiskUse(true)
  .updateOne({
    $set: {
      isActive: true,
    },
  });

console.log(usersUpdated);

/**
 * Pointers
 */

const query = new EleganteQuery();
const pointer = pointer("User", "objectId");

const user = await query.collection("Room").insertOne({
  name: "Room 1",
  owner: pointer, // <-- owner can also be an array of pointers
});

/**
 * Cloud Functions
 */
import { EleganteCloud } from "@elegante/server";

EleganteCloud.add("hello/:name", (req, res) => {
  res.success(`Hello There! ${req.params.name}`);
});

/**
 * Cloud Jobs
 */
import { EleganteJob } from "@elegante/server";
// CLI: el job add makeSomeHeavyTask
EleganteJob.add("makeSomeHeavyTask", (req) => {
  // do some heavy task
  return Promise.resolve("done");
});

// execute a job programatically
// CLI: el job run makeSomeHeavyTask
EleganteJob.run("makeSomeHeavyTask", {});

// return job status programatically
// CLI: el job status makeSomeHeavyTask
EleganteJob.status("makeSomeHeavyTask");

/**
 * JS SDK
 * 
 * A client-side wrapper that executes REST API calls to the server
 * but we can also reuse this same sdk in the server to execute internal stuff
 * and also give the ability to the user to build their shit by using the same sdk
 *
 * REST Calls are enabled by a key in headers
 *
 * X-Elegante-Api-Key: ELEGANTE_SERVER
 * X-Elegante-Api-Secret: ELEGANTE_SECRET
 * 
 * The "X-Elegante" part is white-labelled
 *
 * Secret is only required to run Cloud Jobs, or to execute server-wide things
 *
 * an ERROR is thrown if secretKey is provided in EleganteClient running in browser
 */
import { EleganteClient } from "@elegante/sdk";

const client = new EleganteClient({
  apiKey,
  serverURL: "http://localhost:3135/server",
  serverHeaderPrefix: "X-Elegante", // <-- yeah we can change this and white-label it
});

client
  .listen()
  .then(() => console.log("Elegante Server connected"))
  .catch((err) => console.log("Can't connect to Elegante Server", err));

/**
 * @todo
 * - Cloud Hooks
 * - Cloud Triggers
 * - JS SDK which runs on node and browser
 * - Pointers
 */
