import express from "express";
import { createServer, type Server } from "node:http";
import { logger } from "../shared/logger.js";

/**
 * Start the Monet Web UI server.
 * Serves both the design explorer and the review report.
 */
export async function startUIServer(port = 3000): Promise<Server> {
    const app = express();
    const server = createServer(app);

    // Serve static files from the UI directory
    app.use(express.static(new URL("./public", import.meta.url).pathname));

    // API endpoint for design data
    app.get("/api/design", (_req, res) => {
        res.json({
            message: "Design data endpoint — not yet implemented",
        });
    });

    // API endpoint for review data
    app.get("/api/review", (_req, res) => {
        res.json({
            message: "Review data endpoint — not yet implemented",
        });
    });

    return new Promise((resolve, reject) => {
        server.listen(port, () => {
            logger.info("Monet UI server running at http://localhost:%d", port);
            resolve(server);
        });
        server.on("error", reject);
    });
}
