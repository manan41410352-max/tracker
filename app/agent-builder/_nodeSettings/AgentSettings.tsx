import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { FileJson } from 'lucide-react'
import React, { useEffect, useState } from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'

function AgentSettings({selectedNode, updateFormData}: any) {

    const [formData, setFormData] = useState({
        name: '',
        domain: '',
        instruction: '',
        includeHistory: true,
        model: 'qwen3:14b-q4_K_M',
        output: 'text',
        schema: '',
        websiteDiscovery: false,
        discoveryQuery: '',
        autoOpenDiscoveredSite: true,
        rememberDiscoveredUrl: true,
        discoveredUrlMemoryKey: 'preview_default_url',
        preferredBrowserProfile: 'auto',
        browserProfileMemoryKey: 'preview_browser_profile',
        reuseSignedInSession: true,
    })
//Sync(keep data consistent and updated) Form When Node Changes
    useEffect(() => {
        if (selectedNode?.data?.settings) {
            setFormData({
                name: selectedNode.data.settings.name || '',
                domain: selectedNode.data.settings.domain || '',
                instruction: selectedNode.data.settings.instruction || '',
                includeHistory: selectedNode.data.settings.includeHistory ?? true,
                model: selectedNode.data.settings.model || 'qwen3:14b-q4_K_M',
                output: selectedNode.data.settings.output || 'text',
                schema: selectedNode.data.settings.schema || '',
                websiteDiscovery: Boolean(selectedNode.data.settings.websiteDiscovery),
                discoveryQuery: selectedNode.data.settings.discoveryQuery || '',
                autoOpenDiscoveredSite:
                    selectedNode.data.settings.autoOpenDiscoveredSite ?? true,
                rememberDiscoveredUrl:
                    selectedNode.data.settings.rememberDiscoveredUrl ?? true,
                discoveredUrlMemoryKey:
                    selectedNode.data.settings.discoveredUrlMemoryKey || 'preview_default_url',
                preferredBrowserProfile:
                    selectedNode.data.settings.preferredBrowserProfile || 'auto',
                browserProfileMemoryKey:
                    selectedNode.data.settings.browserProfileMemoryKey || 'preview_browser_profile',
                reuseSignedInSession:
                    selectedNode.data.settings.reuseSignedInSession ?? true
            })
        }
    }, [selectedNode])

//form updater
//One function updates any field
//Avoids writing 10 different handlers
    const handleChange = (Key: string, value: any) => {
        setFormData((prev) => ({
            ...prev,
            [Key]: value,
            ...(Key === 'websiteDiscovery' && value
                ? {
                    output: prev.output || 'json',
                    discoveredUrlMemoryKey: prev.discoveredUrlMemoryKey || 'preview_default_url',
                    browserProfileMemoryKey: prev.browserProfileMemoryKey || 'preview_browser_profile',
                  }
                : {})
        }))
    }

    //save button logic
//     User clicks Save
// formData is sent to parent (SettingPanel)
// SettingPanel:
// updates the selected node
// updates node label
// ReactFlow re-renders node
// Toast confirms success
    const onSave = () => {
        console.log(formData)
        updateFormData(formData)
        toast.success("Settings Updated!")
    }

    return (
        <div>
            <h2 className='font-bold'>Agent</h2>
            <p className='text-gray-500 mt-2'>Call the AI model with your instruction</p>
            <div className='mt-3 space-y-1'>
                <Label>Name</Label>
                <Input 
                    placeholder='Agent Name' 
                    onChange={(event) => handleChange('name', event.target.value)} 
                    value={formData.name}
                />
            </div>
            <div className='mt-3 space-y-1'>
                <Label>Instruction</Label>
                <Textarea 
                    placeholder='Instruction' 
                    onChange={(event) => handleChange('instruction', event.target.value)} 
                    value={formData.instruction}
                />
                <h2 className='text-sm p-1 flex gap-2 items-center'>
                    Add Context <FileJson className='h-3 w-3'/>
                </h2>
            </div>
            <div className='mt-3 flex justify-between items-center'>
                <Label>Include Chat History</Label>
                <Switch 
                    checked={formData.includeHistory} 
                    onCheckedChange={(checked) => handleChange('includeHistory', checked)}
                />
            </div>
            <div className='mt-3 flex justify-between items-center'>
                <Label>Model</Label>
                <Select 
                    onValueChange={(value) => handleChange('model', value)} 
                    value={formData.model}
                >
                    <SelectTrigger>
                        <SelectValue placeholder="Local model"></SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value='qwen3:14b-q4_K_M'>Qwen 3 14B Q4_K_M</SelectItem>
                        <SelectItem value='qwen3.5:35b-a3b'>Qwen 3.5 35B A3B</SelectItem>
                        <SelectItem value='qwen2.5vl:7b'>Qwen 2.5 VL 7B</SelectItem>
                        <SelectItem value='llama3.1:8b'>Llama 3.1 8B</SelectItem>
                    </SelectContent>
                </Select>
            </div>
            <div className='mt-3 flex justify-between items-center'>
                <div>
                    <Label>Website Research Mode</Label>
                    <p className='text-xs text-gray-500'>
                        Let this block discover the best site automatically and open it in preview.
                    </p>
                </div>
                <Switch
                    checked={formData.websiteDiscovery}
                    onCheckedChange={(checked) => handleChange('websiteDiscovery', checked)}
                />
            </div>
            {formData.websiteDiscovery && (
                <>
                    <div className='mt-3 space-y-1'>
                        <Label>Discovery Query</Label>
                        <Textarea
                            placeholder='Optional custom search query. Leave blank to use the task and instruction.'
                            onChange={(event) => handleChange('discoveryQuery', event.target.value)}
                            value={formData.discoveryQuery}
                        />
                    </div>
                    <div className='mt-3 flex justify-between items-center'>
                        <div>
                            <Label>Open Discovered Site</Label>
                            <p className='text-xs text-gray-500'>
                                Attach Brave to the chosen site before the next workflow step.
                            </p>
                        </div>
                        <Switch
                            checked={formData.autoOpenDiscoveredSite}
                            onCheckedChange={(checked) => handleChange('autoOpenDiscoveredSite', checked)}
                        />
                    </div>
                    <div className='mt-3 flex justify-between items-center'>
                        <div>
                            <Label>Remember Site</Label>
                            <p className='text-xs text-gray-500'>
                                Save the discovered URL so later runs can reuse it.
                            </p>
                        </div>
                        <Switch
                            checked={formData.rememberDiscoveredUrl}
                            onCheckedChange={(checked) => handleChange('rememberDiscoveredUrl', checked)}
                        />
                    </div>
                    <div className='mt-3 space-y-1'>
                        <Label>Memory Key</Label>
                        <Input
                            placeholder='preview_default_url'
                            onChange={(event) => handleChange('discoveredUrlMemoryKey', event.target.value)}
                            value={formData.discoveredUrlMemoryKey}
                        />
                    </div>
                    <div className='mt-3 flex justify-between items-center'>
                        <div>
                            <Label>Reuse Signed-In Session</Label>
                            <p className='text-xs text-gray-500'>
                                Prefer the user browser session for inbox, dashboard, and account tasks.
                            </p>
                        </div>
                        <Switch
                            checked={formData.reuseSignedInSession}
                            onCheckedChange={(checked) => handleChange('reuseSignedInSession', checked)}
                        />
                    </div>
                    <div className='mt-3 flex justify-between items-center'>
                        <Label>Preferred Browser Profile</Label>
                        <Select
                            onValueChange={(value) => handleChange('preferredBrowserProfile', value)}
                            value={formData.preferredBrowserProfile}
                        >
                            <SelectTrigger>
                                <SelectValue placeholder="Browser profile" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value='auto'>Auto</SelectItem>
                                <SelectItem value='user'>Signed-in user session</SelectItem>
                                <SelectItem value='automation'>Automation profile</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                    <div className='mt-3 space-y-1'>
                        <Label>Profile Memory Key</Label>
                        <Input
                            placeholder='preview_browser_profile'
                            onChange={(event) => handleChange('browserProfileMemoryKey', event.target.value)}
                            value={formData.browserProfileMemoryKey}
                        />
                    </div>
                </>
            )}
            <div className='mt-3 space-y-2'>
                <Label>Output Format</Label>
                <Tabs 
                    defaultValue="text" 
                    className="w-[400px]" 
                    onValueChange={(value) => handleChange('output', value)} 
                    value={formData.output}
                >
                    <TabsList>
                        <TabsTrigger value="text">Text</TabsTrigger>
                        <TabsTrigger value="json">Json</TabsTrigger>
                    </TabsList>
                    <TabsContent value="text">
                        <h2 className='text-sm text-gray-500'>Output will be Text</h2>
                    </TabsContent>
                    <TabsContent value="json">
                        <Label className='text-sm text-gray-500'>Enter Json Schema</Label>
                        <textarea 
                            placeholder='{title:string}'
                            className='max-w-[300px] mt-1' 
                            onChange={(event) => handleChange('schema', event.target.value)}
                            value={formData.schema}
                        />
                    </TabsContent>
                </Tabs>
            </div>
            <Button className='w-full mt-5' onClick={onSave}>Save</Button>
        </div>
    )
}

export default AgentSettings
