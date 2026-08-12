import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import { TboxClient } from "tbox-nodejs-sdk";

dotenv.config();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const PORT = process.env.PORT || 8081;
app.use(express.json({ limit: "1mb" }));
app.use(express.static(__dirname));

const token = process.env.TBOX_TOKEN;
const careerAppId = process.env.CAREER_APP_ID;
const simulationAppId = process.env.SIMULATION_APP_ID;

function createClient(){
  if(!token) throw new Error("缺少 TBOX_TOKEN，请配置 .env / Railway 环境变量。");
  return new TboxClient({ httpClientConfig:{ authorization: token } });
}
function extractPayload(data){
  const payload=data?.data?.payload;
  if(typeof payload!=="string") return {};
  try{return JSON.parse(payload)}catch{return {text:payload}}
}
function runChat({appId,query,userId,conversationId}){
  return new Promise((resolve,reject)=>{
    if(!appId) return reject(new Error("缺少对应的 Agent App ID。"));
    const client=createClient();
    const params={appId,query,userId};
    if(conversationId) params.conversationId=conversationId;
    const stream=client.chat(params);
    let answer=""; let nextConversationId=conversationId||"";
    stream.on("data",data=>{
      const parsed=extractPayload(data);
      if(!nextConversationId && parsed.conversationId) nextConversationId=parsed.conversationId;
      const chunk=typeof parsed.text==="string"?parsed.text:"";
      if(!chunk) return;
      if(chunk.startsWith(answer)) answer=chunk; else answer+=chunk;
    });
    stream.on("end",()=>resolve({answer:answer.trim(),conversationId:nextConversationId}));
    stream.on("error",reject);
  });
}

app.post("/api/simulation/chat", async (req,res)=>{
  const query=String(req.body?.query||"").trim();
  const userId=String(req.body?.userId||"").trim();
  const conversationId=String(req.body?.conversationId||"").trim();
  if(!query) return res.status(400).json({error:"消息不能为空。"});
  if(!userId) return res.status(400).json({error:"缺少 userId。"});
  try{res.json(await runChat({appId:simulationAppId,query,userId,conversationId}))}
  catch(error){console.error("Simulation API error:",error);res.status(502).json({error:error.message||"职场模拟 Agent 调用失败。"})}
});

app.post("/api/career/consult-ai", async (req,res)=>{
  const message=String(req.body?.message||"").trim();
  const context=req.body?.context||{};
  if(!message) return res.status(400).json({success:false,error:"消息不能为空。"});
  const userId=String(context?.userId||`career_${Date.now()}`);
  try{
    const data=await runChat({appId:careerAppId,query:message,userId});
    res.json({success:true,reply:data.answer});
  }catch(error){console.error("Career API error:",error);res.status(502).json({success:false,error:error.message||"职业规划 Agent 调用失败。"})}
});

app.get("/api/health",(req,res)=>res.json({ok:true,configured:{token:Boolean(token),career:Boolean(careerAppId),simulation:Boolean(simulationAppId)}}));
app.use((req,res)=>res.sendFile(path.join(__dirname,"index.html")));
app.listen(PORT,()=>{
  console.log("==============================================");
  console.log("🚀 AI职业导航整合版已启动");
  console.log(`🌐 本地地址：http://localhost:${PORT}`);
  console.log(`🔧 Token：${token?"已配置":"缺失"} | 职业规划：${careerAppId?"已配置":"缺失"} | 职场模拟：${simulationAppId?"已配置":"缺失"}`);
  console.log("==============================================");
});
