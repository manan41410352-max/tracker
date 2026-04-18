import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { FileJson } from 'lucide-react'
import React, { useEffect, useState } from 'react'
import { toast } from 'sonner'

function UserApproval({selectedNode,updateFormData}:any) {
    // ✅ FIX: Always initialize with defined values
    const [formData,setFormData] = useState({name: '', message: ''})
    
    useEffect(()=>{
        if(selectedNode?.data?.settings) {
            // ✅ FIX: Ensure values are always strings, never undefined
            setFormData({
                name: selectedNode.data.settings.name || '',
                message: selectedNode.data.settings.message || ''
            })
        }
    },[selectedNode])

    const handleChange=(key:string, value:any)=>{
        setFormData((prev)=>({
            ...prev,
            [key]:value
        }))
    }
    
    const onSave=()=>{
        console.log(formData)
        updateFormData(formData)
        toast.success("Settings Updated!")
    }
    
    return (
        <div>
            <h2 className='font-bold'>User Approval</h2>
            <p className='text-gray-500 mt-2'>Pause for a human to approve or reject a step</p>
            <div className='mt-3 space-y-1'>
                <Label>Name</Label>
                <Input 
                    placeholder='Name' 
                    onChange={(event)=>handleChange('name', event.target.value)} 
                    value={formData.name} // ✅ Now always defined
                />
            </div>
            <div className='mt-3 space-y-1'>
                <Label>Message</Label>
                <Textarea 
                    placeholder='Describe the message to show to the user' 
                    onChange={(event)=>handleChange('message', event.target.value)} 
                    value={formData.message} // ✅ Now always defined
                />
            </div>
            <Button className='w-full mt-5' onClick={onSave}>Save</Button>
        </div>
    )
}

export default UserApproval