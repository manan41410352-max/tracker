import { Input } from '@/components/ui/input'
import { Handle, Position } from '@xyflow/react'
import { Merge } from 'lucide-react'
import React from 'react'

const handleStyle = {top:110}
function IfElseNode({data}:any) {
  return (
    <div className='w-40 rounded-2xl border border-border bg-card p-2 px-3 shadow-sm dark:border-slate-800/80 dark:bg-slate-950/95 dark:shadow-black/20'>
      <div className='flex gap-2 items-center'>
        <Merge className='p-2 rounded-lg h-8 w-8'
        style={{
          backgroundColor:data?.bgColor
        }}/>
        <h2 className='text-foreground'>If/Else</h2>
      </div>
      <div className='max-w-[140]px flex flex-col gap-2 mt-2'>
        <Input placeholder='If Condition' className='text-sm' disabled/>
        <Input placeholder='Else Condition' className='text-sm' disabled/>
      </div>
      <Handle type='target' position={Position.Left}/>
      <Handle type='source' position={Position.Right} id={'if'}/>
      <Handle type='source' position={Position.Right} id={'else'} style={handleStyle}/>
    </div>
  )
}

export default IfElseNode
