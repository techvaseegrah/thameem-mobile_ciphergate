import React, { useState, useEffect } from 'react';
import api from '../services/api';

const CustomerDirectory = () => {
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  useEffect(() => {
    fetchCustomers();
  }, [searchTerm, startDate, endDate]);

  const fetchCustomers = async () => {
    try {
      setLoading(true);
      
      // Build query parameters
      const params = new URLSearchParams();
      if (searchTerm) params.append('search', searchTerm);
      if (startDate) params.append('startDate', startDate);
      if (endDate) params.append('endDate', endDate);
      
      const queryString = params.toString();
      const response = await api.get(`/customers${queryString ? '?' + queryString : ''}`);
      
      const customersData = response.data.customers || response.data;
      setCustomers(Array.isArray(customersData) ? customersData : []);
      setError('');
    } catch (err) {
      console.error('Error fetching customers:', err);
      setError('Failed to fetch customer data');
    } finally {
      setLoading(false);
    }
  };

  const handleExportExcel = async () => {
    try {
      setLoading(true);
      
      // Build query parameters for date range
      const params = new URLSearchParams();
      if (startDate) params.append('startDate', startDate);
      if (endDate) params.append('endDate', endDate);
      
      const queryString = params.toString();
      
      // Make direct API call to download the Excel file with date range
      const response = await fetch(`${api.defaults.baseURL}/customer-exports/download-excel${queryString ? '?' + queryString : ''}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${JSON.parse(localStorage.getItem('admin') || '{}').token || localStorage.getItem('token')}`
        }
      });

      if (!response.ok) {
        throw new Error('Failed to download Excel file');
      }

      // Convert response to blob and trigger download
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      
      // Create filename with date range if applicable
      let filename = 'customers_export';
      if (startDate && endDate) {
        filename += `_${startDate}_to_${endDate}`;
      } else if (startDate) {
        filename += `_from_${startDate}`;
      } else if (endDate) {
        filename += `_to_${endDate}`;
      } else {
        filename += `_${new Date().toISOString().split('T')[0]}`;
      }
      filename += '.xlsx';
      
      link.setAttribute('download', filename);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);

      setLoading(false);
    } catch (err) {
      console.error('Error exporting to Excel:', err);
      setError('Failed to export customers to Excel');
      setLoading(false);
    }
  };

  // Filter customers based on search term
  const filteredCustomers = customers.filter(customer =>
    customer.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    customer.phone.includes(searchTerm)
  );

  return (
    <div className="p-4 md:p-8 bg-gray-100 min-h-screen">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Customer Directory</h1>
        <p className="text-gray-600">Manage and export customer contact information</p>
      </div>

      {/* Error message */}
      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
          {error}
        </div>
      )}

      {/* Controls */}
      <div className="bg-white rounded-lg shadow p-6 mb-6">
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <input
              type="text"
              placeholder="Search customers by name or phone..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full shadow appearance-none border rounded py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
            />
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="shadow appearance-none border rounded py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline flex-1"
                placeholder="Start date"
              />
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="shadow appearance-none border rounded py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline flex-1"
                placeholder="End date"
              />
              <button
                onClick={() => {
                  setStartDate('');
                  setEndDate('');
                }}
                className="px-3 py-2 bg-gray-500 text-white rounded hover:bg-gray-600 self-start sm:self-center"
              >
                Clear
              </button>
            </div>
          </div>
          <button
            onClick={handleExportExcel}
            disabled={loading}
            className="bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-6 rounded focus:outline-none focus:shadow-outline disabled:opacity-50 disabled:cursor-not-allowed flex items-center self-start"
          >
            {loading ? (
              <>
                <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Exporting...
              </>
            ) : (
              <>
                📥 Export to Excel
              </>
            )}
          </button>
        </div>
      </div>

      {/* Loading state */}
      {loading && !customers.length && (
        <div className="text-center py-8">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          <p className="mt-2 text-gray-600">Loading customers...</p>
        </div>
      )}

      {/* Customers table */}
      {!loading && (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <div className="overflow-x-auto">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      S.No
                    </th>
                    <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Customer Name
                    </th>
                    <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Phone Number
                    </th>
                    <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Date Added
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {filteredCustomers.length > 0 ? (
                    filteredCustomers.map((customer, index) => (
                      <tr key={customer._id} className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                          {index + 1}
                        </td>
                        <td className="px-4 py-3 text-sm font-medium text-gray-900">
                          <div className="truncate max-w-xs" title={customer.name}>{customer.name}</div>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                          {customer.phone}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                          {customer.createdAt ? new Date(customer.createdAt).toLocaleDateString() : 'N/A'}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan="4" className="px-4 py-4 text-center text-sm text-gray-500">
                        {searchTerm ? 'No customers found matching your search.' : 'No customers found.'}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
          
          {/* Stats */}
          <div className="bg-gray-50 px-6 py-4 border-t border-gray-200">
            <p className="text-sm text-gray-700">
              Showing <span className="font-medium">{filteredCustomers.length}</span> of{' '}
              <span className="font-medium">{customers.length}</span> customers (Name & Phone for WhatsApp)
            </p>
          </div>
        </div>
      )}
    </div>
  );
};

export default CustomerDirectory;