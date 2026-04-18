import StartNode from "../_customNodes/StartNode";
import AgentNode from "../_customNodes/AgentNode";
import EndNode from "../_customNodes/EndNode";
import IfElseNode from "../_customNodes/IfElseNode";
import WhileNode from "../_customNodes/WhileNode";
import UserApprovalNode from "../_customNodes/UserApprovalNode";
import ApiNode from "../_customNodes/ApiNode";
import QuestionNode from "../_customNodes/QuestionNode";
import FormNode from "../_customNodes/FormNode";
import CaptchaNode from "../_customNodes/CaptchaNode";

export const nodeTypes = {
  start: StartNode,
  StartNode,
  AgentNode,
  SignInAgentNode: AgentNode,
  ResearcherAgentNode: AgentNode,
  WriterAgentNode: AgentNode,
  ViewerAgentNode: AgentNode,
  ReviewerAgentNode: AgentNode,
  ExecutorAgentNode: AgentNode,
  EndNode,
  IfElseNode,
  WhileNode,
  UserApprovalNode,
  ApiNode,
  QuestionNode,
  FormNode,
  CaptchaNode,
};
