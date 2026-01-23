import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import { exportActiveJobs } from '../utils/reportUtils';

const ActiveJobs = () => {
  const [jobs, setJobs] = useState([]);
  const [filteredJobs, setFilteredJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const navigate = useNavigate();

  // Check authentication
  useEffect(() => {
    const storedAdmin = localStorage.getItem('admin');
    if (!storedAdmin) {
      navigate('/admin/login');
    }
  }, [navigate]);

  useEffect(() => {
    api.get('/jobs/active')
      .then(res => {
        setJobs(res.data);
        setFilteredJobs(res.data);
        setLoading(false);
      })
      .catch(err => {
        console.error(err);
        setError('Failed to fetch jobs');
        setLoading(false);
      });
  }, []);

  // Apply search filter
  useEffect(() => {
    if (!searchTerm) {
      setFilteredJobs(jobs);
      return;
    }
    
    const term = searchTerm.toLowerCase();
    const filtered = jobs.filter(job => 
      job.customer?.name?.toLowerCase().includes(term) ||
      job.device_model?.toLowerCase().includes(term) ||
      job.reported_issue?.toLowerCase().includes(term) ||
      job.job_card_number?.includes(term) ||
      job._id.slice(-6).includes(term)
    );
    
    setFilteredJobs(filtered);
  }, [jobs, searchTerm]);

  // Get status color
  const getStatusColor = (status) => {
    switch(status) {
      case 'Intake': return 'bg-gray-200 text-gray-800';
      case 'In Progress': return 'bg-blue-100 text-blue-800';
      case 'Done': return 'bg-green-100 text-green-800';
      default: return 'bg-yellow-100 text-yellow-800';
    }
  };

  // Format creation date from MongoDB ObjectId
  const formatCreationDate = (objectId) => {
    if (!objectId) return 'N/A';
    try {
      // Extract timestamp from ObjectId (first 4 bytes)
      const timestamp = parseInt(objectId.substring(0, 8), 16) * 1000;
      return new Date(timestamp).toLocaleString('en-IN', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch (err) {
      return 'N/A';
    }
  };

  if (loading) {
    return (
      <div className="p-4 md:p-8 bg-gray-100 min-h-screen flex items-center justify-center">
        <div className="text-xl">Loading jobs...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 md:p-8 bg-gray-100 min-h-screen">
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
          {error}
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 bg-gray-100 min-h-screen">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Active Jobs</h1>
        <p className="text-gray-600">Manage ongoing repair jobs</p>
      </div>

      {/* Search Bar */}
      <div className="bg-white rounded-lg shadow mb-6 p-4">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex-1">
            <label className="block text-sm font-medium text-gray-700 mb-1">Search Jobs</label>
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search by customer, device, issue, job ID..."
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          {searchTerm && (
            <div className="flex items-end">
              <button
                onClick={() => setSearchTerm('')}
                className="px-3 py-2 text-sm text-gray-600 hover:text-gray-800 hover:underline"
              >
                Clear Search
              </button>
            </div>
          )}
        </div>
        <div className="mt-2 text-sm text-gray-500">
          Showing {filteredJobs.length} of {jobs.length} jobs
        </div>
      </div>

      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="border-b border-gray-200 p-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <h2 className="text-xl font-semibold text-gray-800">Job List ({filteredJobs.length})</h2>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => exportActiveJobs(api, 'pdf')}
              className="px-4 py-2 bg-red-600 text-white rounded-lg font-semibold hover:bg-red-700 transition text-sm"
            >
              Export PDF
            </button>
            <button
              onClick={() => exportActiveJobs(api, 'excel')}
              className="px-4 py-2 bg-green-600 text-white rounded-lg font-semibold hover:bg-green-700 transition text-sm"
            >
              Export Excel
            </button>
          </div>
        </div>
        {filteredJobs.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            {searchTerm ? 'No jobs match your search criteria.' : 'No active jobs found.'}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Job ID</th>
                  <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Customer</th>
                  <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Device</th>
                  <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Issue</th>
                  <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                  <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Created</th>
                  <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredJobs.map(job => (
                  <tr key={job._id}>
                    <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-900">
                      ...{job._id.slice(-6)}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                      {job.customer?.name || 'N/A'}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                      {job.device_model || 'N/A'}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                      {job.reported_issue?.substring(0, 30) || 'N/A'}{job.reported_issue?.length > 30 ? '...' : ''}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${getStatusColor(job.status)}`}>
                        {job.status || 'N/A'}
                      </span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                      {formatCreationDate(job._id)}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm font-medium">
                      <Link to={`/jobs/${job._id}`} className="text-blue-600 hover:text-blue-900">
                        View Details
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default ActiveJobs;
