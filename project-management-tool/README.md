# TaskFlow — Project Management Tool

A collaborative project management tool inspired by Trello and Asana, built with HTML, CSS, JavaScript, Express.js, and SQLite.

## Features
- Register and log in with hashed passwords
- Create project boards and invite registered users by email
- Shared tasks with To do, In progress, and Done columns
- Task descriptions, due dates, and priority
- Assign tasks to project members
- Comment on tasks
- In-app notifications for invitations, tasks, assignments, and comments
- Responsive interface for desktop and mobile

## Requirements
- Node.js 18+
- npm

## Run locally
```bash
npm install
npm start
```
Open http://localhost:3000. The SQLite database is created automatically in `data/projects.db`.

## Try collaboration
1. Register an account and create a project.
2. Register a second account in another browser/private window.
3. As the project owner, open the board and invite the second account using its registered email.
4. Log in as the second account to access the shared board.
5. Add tasks, assign them, update statuses, and comment.

## Main API routes
- `POST /api/auth/register`, `POST /api/auth/login`
- `GET/POST /api/projects`
- `GET/POST /api/projects/:projectId/members`
- `GET/POST /api/projects/:projectId/tasks`
- `PATCH/DELETE /api/tasks/:id`
- `GET/POST /api/tasks/:id/comments`
- `GET /api/notifications`, `PATCH /api/notifications/read`

## Push to GitHub
Create an empty repository and run these commands in this folder:
```bash
git init
git add .
git commit -m "Build collaborative project management tool"
git branch -M main
git remote add origin https://github.com/YOUR-USERNAME/YOUR-REPOSITORY.git
git push -u origin main
```
Replace the sample URL with your own repository URL.

## Notes
This is a student/demo project, not a production-ready service. Set a strong `JWT_SECRET` environment variable before deployment. Do not commit `.env` files, database files, credentials, or personal data. Notifications are stored and refreshed periodically in the UI; WebSocket-based instant updates are a future enhancement.
