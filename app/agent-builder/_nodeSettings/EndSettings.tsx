import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import React, { useEffect, useState } from 'react'
import { toast } from 'sonner'

function EndSettings({selectedNode,updateFormData}:any) {
    const [formData,setFormData] = useState({schema: ''})
    
    useEffect(()=>{
        if(selectedNode?.data?.settings) {
            setFormData({
                schema: selectedNode.data.settings.schema || ''
            })
        }
    },[selectedNode])
    
    const handleChange = (value: string) => {
        setFormData({schema: value})
    }
    
    return (
        <div>
            <h2 className='font-bold'>End</h2>
            <p className='text-gray-500 mt-2'>Choose the workflow output</p>
            <div className='mt-2 space-y-2'>
                <Label>Output</Label>
                <Textarea 
                    placeholder='{name:string}' 
                    onChange={(e)=>handleChange(e.target.value)} 
                    value={formData.schema}
                />
            </div>
            <Button className='w-full mt-5' onClick={()=>{updateFormData(formData);toast.success('Updated!')}}>Save</Button>
        </div>
    )
}

export default EndSettings