import React from 'react'
import { Input } from '@/components/ui/input'
import { Handle, Position } from '@xyflow/react'
import { ThumbsUp } from 'lucide-react'
import { Button } from '@/components/ui/button'

const handleStyle = {top:110}
function UserApprovalNode({data}:any) {
  return (
    <div className='w-43 rounded-2xl border border-border bg-card p-2 px-3 shadow-sm dark:border-slate-800/80 dark:bg-slate-950/95 dark:shadow-black/20'>
      <div className='flex gap-2 items-center'>
        <ThumbsUp className='p-2 rounded-lg h-8 w-8'
        style={{
          backgroundColor:data?.bgColor
        }}/>
        <h2 className='text-foreground'>User Approval</h2>
      </div>
      <div className='max-w-[140]px flex flex-col gap-2 mt-2'>
        <Button variant={'outline'} disabled>Approve</Button>
        <Button variant={'outline'} disabled>Reject</Button>
      </div>
      <Handle type='target' position={Position.Left}/>
      <Handle type='source' position={Position.Right} id={'approve'}/>
      <Handle type='source' position={Position.Right} id={'reject'} style={handleStyle}/>
    </div>
  )
}

export default UserApprovalNode
