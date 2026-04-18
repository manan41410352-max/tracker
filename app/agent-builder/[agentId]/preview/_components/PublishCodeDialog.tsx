import React from "react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { BundledLanguage } from "@/components/ui/shadcn-io/code-block";
import {
  CodeBlock,
  CodeBlockBody,
  CodeBlockContent,
  CodeBlockCopyButton,
  CodeBlockFilename,
  CodeBlockFiles,
  CodeBlockHeader,
  CodeBlockItem,
  CodeBlockSelect,
  CodeBlockSelectContent,
  CodeBlockSelectItem,
  CodeBlockSelectTrigger,
  CodeBlockSelectValue,
} from "@/components/ui/shadcn-io/code-block";

type Props = {
  openDialog: boolean;
  setOpenDialog: (open: boolean) => void;
  agentId?: string;
};

const code = [
  {
    language: "jsx",
    filename: "MyComponent.jsx",
    code: `const res = await fetch('http://localhost:3000/api/agent-sdk', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    agentId: '<agentId>',
    userInput: '<userInput>',
    conversationId: '<optionalConversationId>'
  })
});

const conversationId = res.headers.get('x-conversation-id');
const text = await res.text();
console.log({ conversationId, text });`,
  },
];

function PublishCodeDialog({ openDialog, setOpenDialog, agentId }: Props) {
  const files = [
    {
      ...code[0],
      code: code[0].code.replace("<agentId>", agentId || "your-agent-id"),
    },
  ];

  return (
    <Dialog open={openDialog} onOpenChange={setOpenDialog}>
      <DialogContent className="min-w-3xl">
        <DialogHeader>
          <DialogTitle>Get Code</DialogTitle>
          <DialogDescription>
            <CodeBlock data={files} defaultValue={files[0].language}>
              <CodeBlockHeader>
                <CodeBlockFiles>
                  {(item) => (
                    <CodeBlockFilename key={item.language} value={item.language}>
                      {item.filename}
                    </CodeBlockFilename>
                  )}
                </CodeBlockFiles>
                <CodeBlockSelect>
                  <CodeBlockSelectTrigger>
                    <CodeBlockSelectValue />
                  </CodeBlockSelectTrigger>
                  <CodeBlockSelectContent>
                    {(item) => (
                      <CodeBlockSelectItem key={item.language} value={item.language}>
                        {item.language}
                      </CodeBlockSelectItem>
                    )}
                  </CodeBlockSelectContent>
                </CodeBlockSelect>
                <CodeBlockCopyButton
                  onCopy={() => console.log("Copied code to clipboard")}
                  onError={() => console.error("Failed to copy code to clipboard")}
                />
              </CodeBlockHeader>
              <CodeBlockBody>
                {(item) => (
                  <CodeBlockItem key={item.language} value={item.language}>
                    <CodeBlockContent language={item.language as BundledLanguage}>
                      {item.code}
                    </CodeBlockContent>
                  </CodeBlockItem>
                )}
              </CodeBlockBody>
            </CodeBlock>
          </DialogDescription>
        </DialogHeader>
      </DialogContent>
    </Dialog>
  );
}

export default PublishCodeDialog;
