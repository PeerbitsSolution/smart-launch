# Builds and runs the EHR launch example app only. Not a production
# image for the library itself — see SECURITY.md.
FROM node:20-slim

WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .

EXPOSE 3000
CMD ["npm", "run", "example:ehr"]
