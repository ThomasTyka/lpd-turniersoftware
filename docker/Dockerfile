# syntax=docker/dockerfile:1

# --- frontend build -----------------------------------------------------
FROM node:22-alpine AS frontend-build
WORKDIR /src/frontend
COPY frontend/package.json frontend/package-lock.json* ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# --- backend build -------------------------------------------------------
FROM mcr.microsoft.com/dotnet/sdk:10.0 AS backend-build
WORKDIR /src/backend
COPY backend/ ./
RUN dotnet publish LetsPlayDarts.Api/LetsPlayDarts.Api.csproj -c Release -o /app/backend/LetsPlayDarts.Api

# --- runtime ---------------------------------------------------------------
FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS runtime
WORKDIR /app/backend/LetsPlayDarts.Api

COPY --from=backend-build /app/backend/LetsPlayDarts.Api ./
# Path.Combine(ContentRootPath, "..", "..", "frontend", "dist") in Program.cs
# expects this exact relative layout - two levels above the api folder.
COPY --from=frontend-build /src/frontend/dist /app/frontend/dist

ENV ASPNETCORE_URLS=http://+:8080
ENV ASPNETCORE_ENVIRONMENT=Production
EXPOSE 8080

VOLUME ["/data"]

ENTRYPOINT ["dotnet", "LetsPlayDarts.Api.dll"]
