import "dotenv/config";
import db from "./config/mongo";
import swaggerDocs from "./utils/swagger";
import createApp from "./create-app";

const PORT = process.env.PORT || 30001;

const app = createApp();

db().then(() => console.log("Conection Ready"));
app.listen(PORT, async () => {
  console.log(`Ready by port ${PORT}`);
  swaggerDocs(app, +PORT);
});
