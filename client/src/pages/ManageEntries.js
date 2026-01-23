import React, { useState, useEffect } from 'react';
import api from '../services/api';

const ManageEntries = () => {
  const [activeTab, setActiveTab] = useState('fault_issue');
  const [entries, setEntries] = useState({ fault_issue: [], device_condition: [] });
  const [newEntry, setNewEntry] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [editingValue, setEditingValue] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Fetch entries when component mounts or active tab changes
  useEffect(() => {
    fetchEntries();
  }, []);

  const fetchEntries = async () => {
    try {
      setLoading(true);
      const response = await api.get('/common-entries');
      const allEntries = response.data.entries;

      // Separate entries by type
      const faultIssues = allEntries.filter(entry => entry.type === 'fault_issue');
      const deviceConditions = allEntries.filter(entry => entry.type === 'device_condition');

      setEntries({
        fault_issue: faultIssues,
        device_condition: deviceConditions
      });
    } catch (err) {
      console.error('Error fetching entries:', err);
      setError('Failed to fetch entries');
    } finally {
      setLoading(false);
    }
  };

  const handleAddEntry = async (e) => {
    e.preventDefault();
    
    if (!newEntry.trim()) {
      setError('Entry value is required');
      return;
    }

    try {
      await api.post('/common-entries', {
        type: activeTab,
        value: newEntry.trim()
      });

      setNewEntry('');
      setSuccess('Entry added successfully');
      fetchEntries(); // Refresh the list
    } catch (err) {
      console.error('Error adding entry:', err);
      setError(err.response?.data?.error || 'Failed to add entry');
    }
  };

  const handleStartEdit = (entry) => {
    setEditingId(entry._id);
    setEditingValue(entry.value);
  };

  const handleUpdateEntry = async () => {
    if (!editingValue.trim()) {
      setError('Entry value is required');
      return;
    }

    try {
      await api.put(`/common-entries/${editingId}`, {
        value: editingValue.trim()
      });

      setEditingId(null);
      setEditingValue('');
      setSuccess('Entry updated successfully');
      fetchEntries(); // Refresh the list
    } catch (err) {
      console.error('Error updating entry:', err);
      setError(err.response?.data?.error || 'Failed to update entry');
    }
  };

  const handleDeleteEntry = async (id) => {
    if (!window.confirm('Are you sure you want to delete this entry?')) {
      return;
    }

    try {
      await api.delete(`/common-entries/${id}`);

      setSuccess('Entry deleted successfully');
      fetchEntries(); // Refresh the list
    } catch (err) {
      console.error('Error deleting entry:', err);
      setError(err.response?.data?.error || 'Failed to delete entry');
    }
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditingValue('');
  };

  const getTabName = (type) => {
    return type === 'fault_issue' ? 'Fault / Issue' : 'Device Condition';
  };

  return (
    <div className="p-4 md:p-8 bg-gray-100 min-h-screen">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Manage Entries</h1>
        <p className="text-gray-600">Manage common fault/issue and device condition entries</p>
      </div>

      {/* Error and Success messages */}
      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
          {error}
        </div>
      )}

      {success && (
        <div className="bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded mb-4">
          {success}
        </div>
      )}

      {/* Tab Navigation */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="border-b border-gray-200">
          <nav className="-mb-px flex overflow-x-auto py-2">
            <button
              onClick={() => setActiveTab('fault_issue')}
              className={`py-2 px-4 border-b-2 font-medium text-sm flex-shrink-0 ${
                activeTab === 'fault_issue'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              Fault / Issue
            </button>
            <button
              onClick={() => setActiveTab('device_condition')}
              className={`py-2 px-4 border-b-2 font-medium text-sm flex-shrink-0 ${
                activeTab === 'device_condition'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              Device Condition
            </button>
          </nav>
        </div>

        {/* Add Entry Form */}
        <div className="mt-6">
          <form onSubmit={handleAddEntry} className="mb-6">
            <div className="flex flex-col gap-4">
              <input
                type="text"
                value={newEntry}
                onChange={(e) => setNewEntry(e.target.value)}
                placeholder={`Enter new ${getTabName(activeTab).toLowerCase()}...`}
                className="shadow appearance-none border rounded py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
              />
              <button
                type="submit"
                className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-6 rounded focus:outline-none focus:shadow-outline self-start"
              >
                Add Entry
              </button>
            </div>
          </form>

          {/* Loading State */}
          {loading && (
            <div className="text-center py-8">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
              <p className="mt-2 text-gray-600">Loading entries...</p>
            </div>
          )}

          {/* Entries List */}
          {!loading && (
            <div>
              <h3 className="text-lg font-medium text-gray-900 mb-4">
                {getTabName(activeTab)} Entries ({entries[activeTab].length})
              </h3>
              
              {entries[activeTab].length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <p>No {getTabName(activeTab).toLowerCase()} entries found.</p>
                  <p className="mt-2">Add a new entry using the form above.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Value
                          </th>
                          <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Created
                          </th>
                          <th scope="col" className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Actions
                          </th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {entries[activeTab].map((entry) => (
                          <tr key={entry._id} className="hover:bg-gray-50">
                            <td className="px-4 py-3 text-sm text-gray-900">
                              {editingId === entry._id ? (
                                <input
                                  type="text"
                                  value={editingValue}
                                  onChange={(e) => setEditingValue(e.target.value)}
                                  className="shadow appearance-none border rounded py-1 px-2 text-gray-700 leading-tight focus:outline-none focus:shadow-outline w-full"
                                  autoFocus
                                />
                              ) : (
                                <span className="block truncate max-w-xs" title={entry.value}>{entry.value}</span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-500">
                              {new Date(entry.createdAt).toLocaleDateString()}
                            </td>
                            <td className="px-4 py-3 text-right text-sm font-medium">
                              {editingId === entry._id ? (
                                <div className="flex justify-end space-x-2">
                                  <button
                                    onClick={handleUpdateEntry}
                                    className="text-green-600 hover:text-green-900 text-sm font-medium"
                                    title="Save"
                                  >
                                    Save
                                  </button>
                                  <button
                                    onClick={handleCancelEdit}
                                    className="text-gray-600 hover:text-gray-900 text-sm font-medium ml-2"
                                    title="Cancel"
                                  >
                                    Cancel
                                  </button>
                                </div>
                              ) : (
                                <div className="flex justify-end space-x-2">
                                  <button
                                    onClick={() => handleStartEdit(entry)}
                                    className="text-blue-600 hover:text-blue-900 text-sm font-medium"
                                    title="Edit"
                                  >
                                    Edit
                                  </button>
                                  <button
                                    onClick={() => handleDeleteEntry(entry._id)}
                                    className="text-red-600 hover:text-red-900 text-sm font-medium ml-2"
                                    title="Delete"
                                  >
                                    Delete
                                  </button>
                                </div>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ManageEntries;