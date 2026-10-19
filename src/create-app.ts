import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import fileUpload from "express-fileupload";

import searchRouter from "./routes/search";
import categoryRouter from "./routes/categories";
import productRouter from "./routes/products";
import userRouter from "./routes/users";
import authRouter from "./routes/auth";
import couponRouter from "./routes/coupons";

// Builds the Express app without connecting to the database or listening,
// so tests can load it. src/app.ts adds the DB connection, listen and Swagger.
const createApp = () => {
  const app = express();
  app.disable("x-powered-by");
  app.use(cors());
  // app.use(
  //   cors({
  //     origin: (origin, callback) => {
  //       const ACCEPTED_ORIGINS = [
  //         "http://localhost:3000",
  //         "http://localhost:5000",
  //         "http://localhost:5173",
  //       ];
  //     },
  //   })
  // );
  app.use(express.json());
  app.use(express.static("public"));
  app.use(cookieParser());
  app.use(
    fileUpload({
      useTempFiles: true,
      tempFileDir: "/tmp/",
      createParentPath: true,
    })
  );

  app.use("/search/", searchRouter);
  app.use("/categories", categoryRouter);
  app.use("/products", productRouter);
  app.use("/users", userRouter);
  app.use("/auth", authRouter);
  app.use("/coupons", couponRouter);

  app.get("/", (req, res) => {
    res.send("Backend radi!");
  });

  return app;
};

export default createApp;
