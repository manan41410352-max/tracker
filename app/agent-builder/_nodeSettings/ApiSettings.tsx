"use client"
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import React, { useEffect, useState } from 'react'
import { Textarea } from "@/components/ui/textarea"
import { toast } from 'sonner'
import { FileJson } from 'lucide-react'

const defaultSettings = {
    name: '',
    method: 'GET',
    url: '',
    apiKey: '',
    includeApiKey: true,
    bodyparams: ''
}

function ApiAgentSettings({ selectedNode, updateFormData }: any) {

    const [formData, setFormData] = useState(defaultSettings);

    useEffect(() => {
        if (selectedNode?.data?.settings) {
            setFormData({
                name: selectedNode.data.settings.name || '',
                method: selectedNode.data.settings.method || 'GET',
                url: selectedNode.data.settings.url || '',
                apiKey: selectedNode.data.settings.apiKey || '',
                includeApiKey: selectedNode.data.settings.includeApiKey ?? true,
                bodyparams: selectedNode.data.settings.bodyparams || ''
            })
        }
    }, [selectedNode])

    const handleChange = (key: string, value: any) => {
        setFormData(prev => ({
            ...prev,
            [key]: value
        }))
    }

    const handleJsonFileUpload = async (event: any) => {
        const file = event.target.files?.[0];
        if (!file) return;

        try {
            const text = await file.text();
            const json = JSON.parse(text);

            handleChange("bodyparams", JSON.stringify(json, null, 2));
            toast.success("JSON loaded successfully");
        } catch (error) {
            toast.error("Invalid JSON file");
        }
    };

    const onSave = () => {
        updateFormData(formData)
        toast.success("API Agent Settings Updated!")
    }

    return (
        <div>
            <h2 className='font-bold'>API Agent</h2>
            <p className='text-gray-500 mt-1'>
                Call your external API endpoint with your chosen method
            </p>

            <div className='mt-3 space-y-1'>
                <Label>Name</Label>
                <Input
                    placeholder='Api Agent'
                    onChange={(event) => handleChange('name', event.target.value)}
                    value={formData.name}
                />
            </div>

            <div className='mt-3 space-y-1'>
                <Label>Request Method</Label>
                <Select
                    onValueChange={(value) => handleChange('method', value)}
                    value={formData.method}
                >
                    <SelectTrigger>
                        <SelectValue placeholder="Select Method" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value='GET'>GET</SelectItem>
                        <SelectItem value='POST'>POST</SelectItem>
                    </SelectContent>
                </Select>
            </div>

            <div className='mt-3 space-y-1'>
                <Label>API URL</Label>
                <Input
                    placeholder='https://api.example.com/data'
                    onChange={(event) => handleChange('url', event.target.value)}
                    value={formData.url}
                />
            </div>

            <div className='mt-3 space-y-1 flex flex-row justify-between items-center'>
                <Label>Include API Key</Label>
                <Switch
                    checked={formData.includeApiKey}
                    onCheckedChange={(checked) => handleChange('includeApiKey', checked)}
                />
            </div>

            {formData.includeApiKey && (
                <div className="mt-3 space-y-1">
                    <Label>Enter API Key</Label>
                    <Input
                        type="password"
                        placeholder="Enter your API Key"
                        value={formData.apiKey}
                        onChange={(e) => handleChange("apiKey", e.target.value)}
                    />
                </div>
            )}

            {formData.method === "POST" && (
                <div className='mt-4'>
                    <Label>Body Params (JSON)</Label>
                    <Textarea
                        placeholder='{"key": "value"}'
                        className='mt-2 min-h-[100px]'
                        value={formData.bodyparams}
                        onChange={(e) => handleChange("bodyparams", e.target.value)}
                    />
                    
                    <Label className='mt-4 block'>Add Body Params<FileJson/></Label>
                    
                </div>
            )}

            <Button className='w-full mt-5' onClick={onSave}>Save</Button>
        </div>
    )
}

export default ApiAgentSettings