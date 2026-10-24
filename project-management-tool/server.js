const express = require("express");
const path = require("path");
const fs = require("fs");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const Database = require("better-sqlite3");

const app = express();
const PORT = process.env.PORT || 3000;
const SECRET = process.env.JWT_SECRET || "development-secret-change-before-deploying";
fs.mkdirSync(path.join(__dirname, "data"), { recursive: true });
const db = new Database(path.join(__dirname, "data/projects.db"));
db.pragma("foreign_keys = ON");
db.exec(`
CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY, name TEXT NOT NULL, email TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS projects(id INTEGER PRIMARY KEY, name TEXT NOT NULL, description TEXT DEFAULT '', owner_id INTEGER NOT NULL REFERENCES users(id), created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS members(project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE, user_id INTEGER REFERENCES users(id) ON DELETE CASCADE, role TEXT DEFAULT 'member', PRIMARY KEY(project_id,user_id));
CREATE TABLE IF NOT EXISTS tasks(id INTEGER PRIMARY KEY, project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE, title TEXT NOT NULL, description TEXT DEFAULT '', status TEXT DEFAULT 'todo', priority TEXT DEFAULT 'medium', assignee_id INTEGER REFERENCES users(id) ON DELETE SET NULL, created_by INTEGER REFERENCES users(id), due_date TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS comments(id INTEGER PRIMARY KEY, task_id INTEGER REFERENCES tasks(id) ON DELETE CASCADE, user_id INTEGER REFERENCES users(id) ON DELETE CASCADE, body TEXT NOT NULL, created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS notifications(id INTEGER PRIMARY KEY, user_id INTEGER REFERENCES users(id) ON DELETE CASCADE, project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE, message TEXT NOT NULL, is_read INTEGER DEFAULT 0, created_at TEXT DEFAULT CURRENT_TIMESTAMP);
`);
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

function auth(req,res,next){
 const h=req.headers.authorization||"", token=h.startsWith("Bearer ")?h.slice(7):"";
 if(!token)return res.status(401).json({message:"Please log in first."});
 try{req.user=jwt.verify(token,SECRET);next()}catch{return res.status(401).json({message:"Session expired. Please log in again."})}
}
function projectMember(req,res,next){
 const id=Number(req.params.projectId);
 const m=db.prepare("SELECT role FROM members WHERE project_id=? AND user_id=?").get(id,req.user.id);
 if(!m)return res.status(403).json({message:"You are not a member of this project."});
 req.projectId=id;req.role=m.role;next();
}
function notify(userId,projectId,message){
 db.prepare("INSERT INTO notifications(user_id,project_id,message) VALUES(?,?,?)").run(userId,projectId,message);
}
function token(user){return jwt.sign({id:user.id,email:user.email},SECRET,{expiresIn:"7d"})}

app.post("/api/auth/register",async(req,res)=>{
 const {name,email,password}=req.body||{};
 if(!name?.trim()||!email?.trim()||!password)return res.status(400).json({message:"Name, email and password are required."});
 if(password.length<6)return res.status(400).json({message:"Password must be at least 6 characters."});
 try{
  const hash=await bcrypt.hash(password,10),mail=email.trim().toLowerCase();
  const r=db.prepare("INSERT INTO users(name,email,password_hash) VALUES(?,?,?)").run(name.trim(),mail,hash);
  const user={id:Number(r.lastInsertRowid),name:name.trim(),email:mail};
  res.status(201).json({user,token:token(user)});
 }catch(e){res.status(409).json({message:"This email may already be registered."})}
});
app.post("/api/auth/login",async(req,res)=>{
 const row=db.prepare("SELECT * FROM users WHERE email=?").get(String(req.body?.email||"").trim().toLowerCase());
 if(!row||!(await bcrypt.compare(req.body?.password||"",row.password_hash)))return res.status(401).json({message:"Invalid email or password."});
 const user={id:row.id,name:row.name,email:row.email};res.json({user,token:token(user)});
});
app.get("/api/projects",auth,(req,res)=>{
 res.json(db.prepare(`SELECT p.*,(SELECT COUNT(*) FROM tasks t WHERE t.project_id=p.id) task_count,
 (SELECT COUNT(*) FROM members m WHERE m.project_id=p.id) member_count
 FROM projects p JOIN members m ON m.project_id=p.id WHERE m.user_id=? ORDER BY p.id DESC`).all(req.user.id));
});
app.post("/api/projects",auth,(req,res)=>{
 const name=String(req.body?.name||"").trim(),description=String(req.body?.description||"").trim();
 if(!name)return res.status(400).json({message:"Project name is required."});
 const id=db.transaction(()=>{
  const r=db.prepare("INSERT INTO projects(name,description,owner_id) VALUES(?,?,?)").run(name,description,req.user.id);
  db.prepare("INSERT INTO members(project_id,user_id,role) VALUES(?,?,'owner')").run(Number(r.lastInsertRowid),req.user.id);
  return Number(r.lastInsertRowid);
 })();
 res.status(201).json({id,name,description});
});
app.get("/api/projects/:projectId/members",auth,projectMember,(req,res)=>{
 res.json(db.prepare("SELECT u.id,u.name,u.email,m.role FROM members m JOIN users u ON u.id=m.user_id WHERE m.project_id=?").all(req.projectId));
});
app.post("/api/projects/:projectId/members",auth,projectMember,(req,res)=>{
 if(req.role!=="owner")return res.status(403).json({message:"Only the project owner can invite members."});
 const email=String(req.body?.email||"").trim().toLowerCase();
 const user=db.prepare("SELECT id,name FROM users WHERE email=?").get(email);
 if(!user)return res.status(404).json({message:"User not found. Ask them to register first."});
 try{
  db.prepare("INSERT INTO members(project_id,user_id) VALUES(?,?)").run(req.projectId,user.id);
  notify(user.id,req.projectId,"You were added to a project.");
  res.status(201).json({message:`${user.name} added to the project.`});
 }catch{res.status(409).json({message:"This user is already a member."})}
});
app.get("/api/projects/:projectId/tasks",auth,projectMember,(req,res)=>{
 res.json(db.prepare(`SELECT t.*,a.name assignee_name,c.name creator_name FROM tasks t
 LEFT JOIN users a ON a.id=t.assignee_id JOIN users c ON c.id=t.created_by
 WHERE t.project_id=? ORDER BY t.id DESC`).all(req.projectId));
});
app.post("/api/projects/:projectId/tasks",auth,projectMember,(req,res)=>{
 const {title,description="",priority="medium",due_date=null}=req.body||{};
 if(!title?.trim())return res.status(400).json({message:"Task title is required."});
 if(!["low","medium","high"].includes(priority))return res.status(400).json({message:"Invalid priority."});
 const r=db.prepare("INSERT INTO tasks(project_id,title,description,priority,due_date,created_by) VALUES(?,?,?,?,?,?)")
 .run(req.projectId,title.trim(),description.trim(),priority,due_date||null,req.user.id);
 for(const m of db.prepare("SELECT user_id FROM members WHERE project_id=? AND user_id!=?").all(req.projectId,req.user.id))notify(m.user_id,req.projectId,`New task created: ${title.trim()}`);
 res.status(201).json({id:Number(r.lastInsertRowid),message:"Task created."});
});
app.patch("/api/tasks/:id",auth,(req,res)=>{
 const task=db.prepare("SELECT * FROM tasks WHERE id=?").get(Number(req.params.id));
 if(!task)return res.status(404).json({message:"Task not found."});
 if(!db.prepare("SELECT 1 FROM members WHERE project_id=? AND user_id=?").get(task.project_id,req.user.id))return res.status(403).json({message:"Not a project member."});
 const status=req.body?.status??task.status,priority=req.body?.priority??task.priority;
 const assignee=req.body?.assignee_id===undefined?task.assignee_id:(req.body.assignee_id===""?null:Number(req.body.assignee_id));
 if(!["todo","inprogress","done"].includes(status)||!["low","medium","high"].includes(priority))return res.status(400).json({message:"Invalid status or priority."});
 if(assignee!==null&&!db.prepare("SELECT 1 FROM members WHERE project_id=? AND user_id=?").get(task.project_id,assignee))return res.status(400).json({message:"Assignee must be a project member."});
 db.prepare("UPDATE tasks SET status=?,priority=?,assignee_id=? WHERE id=?").run(status,priority,assignee,task.id);
 if(assignee&&assignee!==task.assignee_id)notify(assignee,task.project_id,`A task was assigned to you: ${task.title}`);
 res.json({message:"Task updated."});
});
app.delete("/api/tasks/:id",auth,(req,res)=>{
 const t=db.prepare("SELECT * FROM tasks WHERE id=?").get(Number(req.params.id));
 if(!t)return res.status(404).json({message:"Task not found."});
 const m=db.prepare("SELECT role FROM members WHERE project_id=? AND user_id=?").get(t.project_id,req.user.id);
 if(!m)return res.status(403).json({message:"Not a project member."});
 if(m.role!=="owner"&&t.created_by!==req.user.id)return res.status(403).json({message:"Only owner or task creator can delete this task."});
 db.prepare("DELETE FROM tasks WHERE id=?").run(t.id);res.json({message:"Task deleted."});
});
app.get("/api/tasks/:id/comments",auth,(req,res)=>{
 const t=db.prepare("SELECT * FROM tasks WHERE id=?").get(Number(req.params.id));
 if(!t||!db.prepare("SELECT 1 FROM members WHERE project_id=? AND user_id=?").get(t.project_id,req.user.id))return res.status(404).json({message:"Task not found."});
 res.json(db.prepare("SELECT c.*,u.name FROM comments c JOIN users u ON u.id=c.user_id WHERE c.task_id=? ORDER BY c.id").all(t.id));
});
app.post("/api/tasks/:id/comments",auth,(req,res)=>{
 const t=db.prepare("SELECT * FROM tasks WHERE id=?").get(Number(req.params.id)),body=String(req.body?.body||"").trim();
 if(!t)return res.status(404).json({message:"Task not found."});
 if(!db.prepare("SELECT 1 FROM members WHERE project_id=? AND user_id=?").get(t.project_id,req.user.id))return res.status(403).json({message:"Not a project member."});
 if(!body)return res.status(400).json({message:"Comment cannot be empty."});
 db.prepare("INSERT INTO comments(task_id,user_id,body) VALUES(?,?,?)").run(t.id,req.user.id,body);
 for(const m of db.prepare("SELECT user_id FROM members WHERE project_id=? AND user_id!=?").all(t.project_id,req.user.id))notify(m.user_id,t.project_id,`New comment on task: ${t.title}`);
 res.status(201).json({message:"Comment added."});
});
app.get("/api/notifications",auth,(req,res)=>res.json(db.prepare("SELECT * FROM notifications WHERE user_id=? ORDER BY id DESC LIMIT 50").all(req.user.id)));
app.patch("/api/notifications/read",auth,(req,res)=>{db.prepare("UPDATE notifications SET is_read=1 WHERE user_id=?").run(req.user.id);res.json({message:"Notifications marked read."})});
app.get("*",(req,res)=>res.sendFile(path.join(__dirname,"public/index.html")));
app.listen(PORT,()=>console.log(`TaskFlow running at http://localhost:${PORT}`));
