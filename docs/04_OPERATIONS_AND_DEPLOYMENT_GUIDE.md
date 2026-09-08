# PetroView Forecourt OS — Operations & Deployment Guide

**Document Version:** 2.0  
**Status:** Approved / Production  
**Production Host:** `69.62.106.189` (Ubuntu Linux)  
**Production URL:** `https://petroview.growthspheregh.com`  
**Last Updated:** September 2026  

---

## 1. Production Infrastructure Topology

PetroView is hosted in a production-hardened environment managed by **Dokploy** and orchestrated via **Docker Swarm/Compose** with automated SSL reverse-proxying.

```
                         Internet (HTTPS / Port 443)
                                     |
                                     v
+-----------------------------------------------------------------------------+
|               HOST SERVER: 69.62.106.189 (Ubuntu 22.04 LTS)                |
|                                                                             |
|  +-----------------------------------------------------------------------+  |
|  |             Traefik v3.6.7 (dokploy-traefik Container)                |  |
|  |  - Automated Let's Encrypt TLS Certificate Generation & Auto-Renewal   |  |
|  |  - HTTP -> HTTPS 301 Force Redirect                                   |  |
|  |  - Gzip / Brotli Compression & Security Headers                       |  |
|  +-----------------------------------------------------------------------+  |
|                                    |                                        |
|         Route: petroview.growthspheregh.com (Internal Port 80)              |
|                                    |                                        |
|                                    v                                        |
|  +-----------------------------------------------------------------------+  |
|  |  Application Container: app-hack-bluetooth-monitor-pmn9xp:latest     |  |
|  |  - Multi-stage build image: Node 20 builder -> Nginx Alpine runtime   |  |
|  |  - Zero-downtime container replacement on deployment                  |  |
|  +-----------------------------------------------------------------------+  |
|                                                                             |
|  +-----------------------------------------------------------------------+  |
|  |                 Dokploy Engine & PostgreSQL Storage                   |  |
|  |  - dokploy/dokploy:v0.30.5 (Port 3000 Web UI)                          |  |
|  |  - postgres:16 (Internal metadata & telemetry storage)                |  |
|  +-----------------------------------------------------------------------+  |
+-----------------------------------------------------------------------------+
```

---

## 2. Continuous Integration & Deployment (CI/CD) Workflow

### 2.1 Deployment Pipeline Architecture
PetroView features fully automated continuous deployment linked to the official GitHub repository:
1. **Developer / AI Push:** Code changes are committed and pushed to `main` at `https://github.com/growthsphereafrica/petroview.git`.
2. **GitHub Webhook Trigger:** GitHub sends an authenticated payload to the Dokploy webhook receiver on the VPS.
3. **Dokploy Build Execution:**
   - Clones latest commit on branch `main`.
   - Executes multi-stage Docker build using `Dockerfile.web`.
   - Step 1 (Build): `node:20-alpine` runs `npm ci` and `npm run build` (invoking `tsc && vite build`).
   - Step 2 (Runtime): Copies compiled `/dist` directory to `/usr/share/nginx/html` on `nginx:alpine`.
4. **Zero-Downtime Swap:** Traefik seamlessly switches incoming HTTP traffic to the newly spawned container once healthy, then terminates the previous container instance.

---

## 3. Server Configuration & Dockerfile Reference

### 3.1 Dockerfile (`Dockerfile.web`)
```dockerfile
# Stage 1: Build production React assets
FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# Stage 2: Serve with lightweight Nginx web server
FROM nginx:alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
```

### 3.2 Nginx Configuration (`nginx.conf`)
```nginx
server {
    listen 80;
    server_name localhost;
    root /usr/share/nginx/html;
    index index.html;

    # Enable gzip compression
    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml application/xml+rss text/javascript;

    # Single Page Application (SPA) routing fallback
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Cache immutable static assets
    location /assets/ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    # Health check endpoint
    location /health {
        return 200 'OK';
        add_header Content-Type text/plain;
    }
}
```

---

## 4. Operational Runbook & Maintenance

### 4.1 Connecting to the Production Server
```powershell
# SSH into the VPS server
ssh root@69.62.106.189
```

### 4.2 Inspecting Application Containers & Status
```bash
# Check all running containers
docker ps

# Check Dokploy deployment build logs
tail -f /etc/dokploy/logs/app-hack-bluetooth-monitor-pmn9xp/app-hack-bluetooth-monitor-pmn9xp-*.log

# Check live Nginx web access logs
docker logs -f --tail 100 $(docker ps -q -f name=app-hack-bluetooth-monitor)
```

### 4.3 Manual Trigger & Force Rebuild
If an instant manual rebuild is required on the server:
```bash
# Trigger Dokploy redeploy via curl or CLI
cd /etc/dokploy/applications/app-hack-bluetooth-monitor-pmn9xp
docker build -f Dockerfile.web -t app-hack-bluetooth-monitor-pmn9xp:latest .
```

---

## 5. Backup, Disaster Recovery & Local Data Export

### 5.1 Local Client Data Persistence & Safety
- All station forecourt data (shifts, transactions, logs) is stored in browser **IndexedDB (`MasterViewProductionDB`)**.
- Clearing normal browser cookies does NOT erase IndexedDB in standard desktop/mobile browsers.

### 5.2 Station Emergency Data Export (JSON / CSV)
- Supervisors and OMC Head Office have built-in export triggers in their respective dashboards:
  - **Shift Summary Export:** Downloads `.xlsx` / `.pdf` reports containing full meter records and cash reconciliations.
  - **Audit Log Export:** Downloads complete chronological event logs for compliance reporting.

---
*End of Operations & Deployment Guide.*
