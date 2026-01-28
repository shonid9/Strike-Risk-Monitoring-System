import "dotenv/config";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import path from "path";
import router from "./api/routes";

const app = express();
app.use(express.json());
app.use(cors());
app.use(helmet({
  contentSecurityPolicy: false, // Allow inline scripts for frontend
}));
app.use(morgan("dev"));

app.use("/api", router);

// Serve frontend static files
// Use process.cwd() to get the directory where the server was started (backend/)
// Then go up one level to project root and into frontend/
const backendDir = process.cwd();
const projectRoot = path.resolve(backendDir, "..");
const frontendPath = path.join(projectRoot, "frontend");
const absoluteFrontendPath = path.resolve(frontendPath);
console.log(`Backend dir: ${backendDir}`);
console.log(`Project root: ${projectRoot}`);
console.log(`Frontend path: ${absoluteFrontendPath}`);
console.log(`Frontend exists: ${require("fs").existsSync(absoluteFrontendPath)}`);
app.use(express.static(absoluteFrontendPath, {
  etag: false,
  lastModified: false,
  maxAge: 0,
  setHeaders: (res) => {
    res.setHeader("Cache-Control", "no-store");
  },
}));

// Serve index.html for all non-API routes
app.get("*", (req, res) => {
  if (!req.path.startsWith("/api")) {
    const indexPath = path.join(absoluteFrontendPath, "index.html");
    console.log(`Serving index.html from: ${indexPath}`);
    console.log(`File exists: ${require("fs").existsSync(indexPath)}`);
    if (require("fs").existsSync(indexPath)) {
      res.sendFile(indexPath);
    } else {
      console.error(`File not found: ${indexPath}`);
      res.status(404).send("Frontend not found");
    }
  }
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`Server listening on :${PORT}`);
  console.log(`Frontend: http://localhost:${PORT}`);
  console.log(`API: http://localhost:${PORT}/api`);
});
