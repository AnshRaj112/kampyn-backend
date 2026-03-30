# KAMPYN Backend Docker Guide

This guide covers everything you need to know about building, running, and debugging the Dockerized KAMPYN backend correctly, factoring in Windows WSL2 network behavior and production deployment standards.

---

## 🚀 1. Running Locally (Development)

Locally, you should rely on your existing `.env` file to securely inject your variables (including `NODE_ENV=development`) directly into the running container without hardcoding anything in the image.

### Build the Image
To build the backend image using the optimized `node:20-slim` container:
```bash
docker build -t kampyn-backend .
```

### Run the Container
Start the container in detached mode, load your local `.env` variables natively, and map traffic to the IPv4 loopback adapter.

```bash
docker run -d \
  --name kampyn-app-5001 \
  --env-file .env \
  -p 127.0.0.1:5001:5001 \
  kampyn-backend
```

> **💡 TIP:** Notice the explicit **`127.0.0.1:5001:5001`** binding. This ensures Docker Desktop bypasses the broken Windows `[::1]` (IPv6) proxy and guarantees stable connectivity. Your frontend `.env` must also target `http://127.0.0.1:5001` for this to work flawlessly.

---

## 🌍 2. Deploying to Production (Render / GCP)

When deploying to a production environment like Google Cloud Run or Render, you do not need to upload your `.env` file. Instead, the container takes environment variables natively from the hosting service.

1. **GitHub Actions (GCP):** The deployment `.yml` natively sets environment variables automatically based on GitHub Secrets.
2. **Render:** When launching a Web Service using the Docker environment, Render provides an **Environment Variables** tab where you inject your secrets manually (e.g., `NODE_ENV=production`, `PORT=5001`, `MONGO_URI_USER`, etc.).

**How the Dockerfile receives `NODE_ENV`:**
By completely omitting `ENV NODE_ENV=` inside the `Dockerfile`, the Docker container automatically inherits whatever the deployment system injects! This makes the container completely environment agnostic.

---

## 🛠️ 3. Quick Local Debugging Commands

Here are some essential commands for debugging your running backend container:

**View Backend Server Logs:**
*Check real-time server output, MongoDB connection pooling statuses, and errors.*
```bash
docker logs -f kampyn-app-5001
```

**Restart the Server:**
*If you modify your `.env` file, the container must be recreated.*
```bash
docker rm -f kampyn-app-5001
docker run -d --name kampyn-app-5001 --env-file .env -p 127.0.0.1:5001:5001 kampyn-backend
```

**Test Health Endpoint (Ensure it is awake!):**
```bash
curl -v http://127.0.0.1:5001/api/health
```

---

## 🤔 Troubleshooting

If you ever see a **"Connection Reset"** or **"Empty reply from server"** error on Windows:
1. It means another random service grabbed the `localhost` IPv6 loopback route.
2. Run `docker rm -f kampyn-app-5001`.
3. Ensure you map traffic strictly via standard IPv4: `-p 127.0.0.1:5001:5001`.
4. Run `npm run dev` after ensuring `NEXT_PUBLIC_BACKEND_URL=http://127.0.0.1:5001` is established in your frontend frontend.
