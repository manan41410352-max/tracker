"use client";

import React, { useEffect, useState } from "react";
import { ReactFlowProvider } from "@xyflow/react";
import { useMutation } from "convex/react";

import { UserDetailContext } from "@/context/UserDetailContext";
import { WorkflowContext } from "@/context/WorkflowContext";
import { api } from "@/convex/_generated/api";
import { LOCAL_USER_EMAIL, LOCAL_USER_NAME } from "@/lib/local-user";

const initialNodes = [
  {
    id: "start",
    position: { x: 0, y: 0 },
    data: { label: "Start" },
    type: "StartNode",
  },
];

function SharedProviders({ children }: { children: React.ReactNode }) {
  const [userDetail, setUserDetail] = useState<any>(null);
  const [selectedNode, setSelectedNode] = useState<any>();
  const [addedNodes, setAddedNodes] = useState(initialNodes);
  const [nodeEdges, setNodeEdges] = useState([]);

  return (
    <UserDetailContext.Provider value={{ userDetail, setUserDetail }}>
      <ReactFlowProvider>
        <WorkflowContext.Provider
          value={{
            addedNodes,
            setAddedNodes,
            nodeEdges,
            setNodeEdges,
            selectedNode,
            setSelectedNode,
          }}
        >
          <div>{children}</div>
        </WorkflowContext.Provider>
      </ReactFlowProvider>
    </UserDetailContext.Provider>
  );
}

function LocalWorkspaceProvider({ children }: { children: React.ReactNode }) {
  const createUser = useMutation(api.user.CreateNewUser);

  const [userDetail, setUserDetail] = useState<any>(null);
  const [selectedNode, setSelectedNode] = useState<any>();
  const [addedNodes, setAddedNodes] = useState(initialNodes);
  const [nodeEdges, setNodeEdges] = useState([]);

  useEffect(() => {
    const ensureLocalUser = async () => {
      const result = await createUser({
        name: LOCAL_USER_NAME,
        email: LOCAL_USER_EMAIL,
      });

      setUserDetail(result);
    };

    ensureLocalUser();
  }, [createUser]);

  return (
    <UserDetailContext.Provider value={{ userDetail, setUserDetail }}>
      <ReactFlowProvider>
        <WorkflowContext.Provider
          value={{
            addedNodes,
            setAddedNodes,
            nodeEdges,
            setNodeEdges,
            selectedNode,
            setSelectedNode,
          }}
        >
          <div>{children}</div>
        </WorkflowContext.Provider>
      </ReactFlowProvider>
    </UserDetailContext.Provider>
  );
}

export default function Provider({
  children,
  convexEnabled,
}: {
  children: React.ReactNode;
  convexEnabled?: boolean;
}) {
  if (!convexEnabled) {
    return <SharedProviders>{children}</SharedProviders>;
  }

  return <LocalWorkspaceProvider>{children}</LocalWorkspaceProvider>;
}
