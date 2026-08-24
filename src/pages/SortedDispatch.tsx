import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Send } from 'lucide-react';

export function SortedDispatch() {
  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-8 flex items-center justify-between">
        <div className="flex items-center">
          <Link
            to="/waste-management"
            className="mr-4 text-gray-500 hover:text-gray-700"
          >
            <ArrowLeft className="h-6 w-6" />
          </Link>
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Sorted Plastic Dispatch</h1>
            <p className="mt-2 text-gray-600">
              Record outgoing sorted plastic dispatches.
            </p>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-md p-12 text-center">
        <Send className="h-16 w-16 text-gray-400 mx-auto mb-4" />
        <h2 className="text-2xl font-semibold text-gray-900 mb-2">Coming Soon</h2>
        <p className="text-gray-600">
          The Sorted Plastic Dispatch feature will be available soon.
        </p>
      </div>
    </div>
  );
}
