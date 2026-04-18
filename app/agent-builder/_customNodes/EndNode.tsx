import { Handle, Position } from '@xyflow/react'
import { Square } from 'lucide-react'
import React from 'react'

function EndNode({data}:any) {
  return (
    <div className='rounded-2xl border border-border bg-card p-2 px-3 shadow-sm dark:border-slate-800/80 dark:bg-slate-950/95 dark:shadow-black/20'>
      <div className='flex gap-2 items-center'>
        <Square className='p-2 rounded-lg h-8 w-8'
        style={{
          backgroundColor:data?.bgColor
        }}
        />
        <h2 className='text-foreground'>End</h2>
        <Handle type='target' position={Position.Left}/>
      </div>
    </div>
  )
}

export default EndNode
