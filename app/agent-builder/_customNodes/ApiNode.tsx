import { Handle, Position } from '@xyflow/react'
import { Webhook } from 'lucide-react'
import React from 'react'

function ApiNode({data}:any) {
  return (
    <div className='rounded-2xl border border-border bg-card p-2 px-3 shadow-sm dark:border-slate-800/80 dark:bg-slate-950/95 dark:shadow-black/20'>
      <div className='flex gap-2 items-center'>
        <Webhook className='p-2 rounded-lg h-8 w-8'
        style={{
            backgroundColor:data?.bgColor
        }}/>
        <div className='flex flex-col'>
        <h2 className='text-foreground'>{data?.label}</h2>
        <p className='text-xs text-muted-foreground'>API</p>
        </div>
        <Handle type='target' position={Position.Left}/>
        <Handle type='source' position={Position.Right}/>
      </div>
    </div>
  )
}

export default ApiNode
