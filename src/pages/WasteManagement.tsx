import React from 'react';
import { Trash2, Send, Settings, Beaker } from 'lucide-react';
import { WasteIntakeContent } from './WasteIntakeContent';
import { SortedIntakeContent } from './SortedIntakeContent';
import { ProcessingContent } from './ProcessingContent';
import { LabTestingContent } from './LabTestingContent';

type TabType = 'waste-intake' | 'sorted-intake' | 'processing' | 'lab-testing';

export function WasteManagement() {
  const [activeTab, setActiveTab] = React.useState<TabType>('waste-intake');

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Plastic Waste Management</h1>
        <p className="mt-2 text-gray-600">
          Manage waste plastic intake and sorted plastic dispatch operations.
        </p>
      </div>

      <div className="flex border-b border-gray-200 mb-6">
        <button
          onClick={() => setActiveTab('waste-intake')}
          className={`px-6 py-3 text-sm font-medium ${
            activeTab === 'waste-intake'
              ? 'border-b-2 border-blue-500 text-blue-600'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          <div className="flex items-center">
            <Trash2 className="h-4 w-4 mr-2" />
            Waste Plastic Intake
          </div>
        </button>
        <button
          onClick={() => setActiveTab('sorted-intake')}
          className={`px-6 py-3 text-sm font-medium ${
            activeTab === 'sorted-intake'
              ? 'border-b-2 border-blue-500 text-blue-600'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          <div className="flex items-center">
            <Send className="h-4 w-4 mr-2" />
            Sorted Plastic Intake
          </div>
        </button>
        <button
          onClick={() => setActiveTab('processing')}
          className={`px-6 py-3 text-sm font-medium ${
            activeTab === 'processing'
              ? 'border-b-2 border-blue-500 text-blue-600'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          <div className="flex items-center">
            <Settings className="h-4 w-4 mr-2" />
            Processing
          </div>
        </button>
        <button
          onClick={() => setActiveTab('lab-testing')}
          className={`px-6 py-3 text-sm font-medium ${
            activeTab === 'lab-testing'
              ? 'border-b-2 border-blue-500 text-blue-600'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          <div className="flex items-center">
            <Beaker className="h-4 w-4 mr-2" />
            Lab Testing
          </div>
        </button>
      </div>

      {activeTab === 'waste-intake' && <WasteIntakeContent />}
      {activeTab === 'sorted-intake' && <SortedIntakeContent />}
      {activeTab === 'processing' && <ProcessingContent />}
      {activeTab === 'lab-testing' && <LabTestingContent />}
    </div>
  );
}
