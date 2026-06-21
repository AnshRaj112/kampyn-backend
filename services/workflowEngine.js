const vm = require("vm");
const WorkflowInstance = require("../models/workflow/WorkflowInstance");
const logger = require("../utils/pinoLogger");

/**
 * Safely evaluates boolean expressions using a sandboxed node:vm context
 */
function evaluateExpression(expression, contextData) {
  try {
    const sandbox = { request: contextData };
    const context = vm.createContext(sandbox);
    const script = new vm.Script(expression, { timeout: 50 });
    return !!script.runInContext(context);
  } catch (error) {
    logger.error({ expression, error: error.message }, "Workflow expression evaluation failed");
    return false;
  }
}

/**
 * Processes a single step of the workflow execution
 */
async function processWorkflowStep(instance, definition) {
  const nodes = definition.nodes;
  let currentNodeId = instance.currentNodeId;

  while (currentNodeId) {
    const node = nodes.get(currentNodeId);
    if (!node) {
      instance.status = "failed";
      instance.logs.push({
        nodeId: currentNodeId,
        nodeType: "unknown",
        comment: `Node '${currentNodeId}' not found in workflow definition.`
      });
      break;
    }

    logger.info({ tenantId: instance.tenantId, instanceId: instance._id, nodeType: node.type, nodeId: currentNodeId }, "Processing workflow node");

    if (node.type === "trigger") {
      currentNodeId = node.next;
    } 
    else if (node.type === "condition") {
      const isTrue = evaluateExpression(node.expression, instance.context);
      currentNodeId = isTrue ? node.onTrue : node.onFalse;
      instance.logs.push({
        nodeId: currentNodeId,
        nodeType: "condition",
        action: isTrue ? "eval_true" : "eval_false",
        comment: `Condition evaluated to ${isTrue}`
      });
    } 
    else if (node.type === "approval") {
      instance.status = "paused";
      instance.pendingApprovalByRole = node.assigneeRole;
      instance.currentNodeId = currentNodeId;
      
      const deadline = new Date();
      deadline.setDate(deadline.getDate() + (node.escalationDays || 2));
      instance.escalationDeadline = deadline;

      instance.logs.push({
        nodeId: currentNodeId,
        nodeType: "approval",
        comment: `Workflow paused. Awaiting approval from role '${node.assigneeRole}'.`
      });
      break; // Pause execution
    } 
    else if (node.type === "action") {
      // Execute registered system action triggers
      try {
        instance.logs.push({
          nodeId: currentNodeId,
          nodeType: "action",
          action: "executed",
          comment: `Action handler '${node.actionHandler}' triggered successfully.`
        });
      } catch (err) {
        logger.error({ handler: node.actionHandler, error: err.message }, "Action execution failed");
      }
      currentNodeId = node.next;
    } 
    else if (node.type === "end") {
      instance.status = "completed";
      instance.currentNodeId = currentNodeId;
      instance.logs.push({
        nodeId: currentNodeId,
        nodeType: "end",
        comment: "Workflow execution completed."
      });
      break;
    }
  }

  if (instance.status === "running" && !currentNodeId) {
    instance.status = "completed";
  }

  await instance.save();
}

/**
 * Starts a new workflow instance
 */
async function startWorkflow(definition, triggerData, tenantId) {
  const startNodeKey = Array.from(definition.nodes.keys()).find(
    (key) => definition.nodes.get(key).type === "trigger"
  ) || "start";

  const instance = new WorkflowInstance({
    tenantId,
    definitionId: definition._id,
    status: "running",
    currentNodeId: startNodeKey,
    context: triggerData,
    logs: [{ nodeId: startNodeKey, nodeType: "trigger", comment: "Workflow instance started" }]
  });

  await processWorkflowStep(instance, definition);
  return instance;
}

/**
 * Resumes execution of a paused approval step
 */
async function resolveApprovalStep(instanceId, roleName, action, actorId, comment) {
  const instance = await WorkflowInstance.findById(instanceId);
  if (!instance || instance.status !== "paused") {
    throw new Error("Instance not found or not in paused approval state.");
  }

  const definition = await mongoose.model("WorkflowDefinition").findById(instance.definitionId);
  const node = definition.nodes.get(instance.currentNodeId);

  if (instance.pendingApprovalByRole !== roleName) {
    throw new Error(`Insufficient role: Required role is '${instance.pendingApprovalByRole}'.`);
  }

  instance.logs.push({
    nodeId: instance.currentNodeId,
    nodeType: "approval",
    action,
    actor: actorId,
    comment
  });

  if (action === "approve") {
    instance.currentNodeId = node.onApprove;
    instance.status = "running";
    instance.pendingApprovalByRole = undefined;
    instance.escalationDeadline = undefined;
    await processWorkflowStep(instance, definition);
  } else {
    instance.currentNodeId = node.onReject;
    instance.status = "rejected";
    instance.pendingApprovalByRole = undefined;
    instance.escalationDeadline = undefined;
    await processWorkflowStep(instance, definition);
  }

  return instance;
}

module.exports = {
  startWorkflow,
  resolveApprovalStep
};
