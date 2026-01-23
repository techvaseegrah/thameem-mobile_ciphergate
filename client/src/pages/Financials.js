import React, { useState, useEffect } from 'react';
import { LineChart, Line, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell, ComposedChart, Bar } from 'recharts';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

const Financials = () => {
  const [financialData, setFinancialData] = useState({
    revenue_by_department: [],
    monthly_revenue: [],
    parts_cost_analysis: [],
    parts_revenue_analysis: [],
    transaction_revenue_by_department: [],
    transaction_monthly_revenue: [],
    total_jobs_revenue: 0,
    total_service_charges: 0
  });

  // Debug function to validate data
  const validateChartData = (data, type) => {
    if (!Array.isArray(data)) {
      console.warn(`${type} data is not an array:`, data);
      return [];
    }
    
    // Check if data has required fields
    const hasRequiredFields = data.every(item => {
      if (type === 'revenue_by_department') {
        return item.department !== undefined && item.revenue !== undefined;
      } else if (type === 'monthly_revenue') {
        return item.month !== undefined && item.revenue !== undefined;
      } else if (type === 'parts_revenue_analysis') {
        return item.name !== undefined && item.revenue !== undefined;
      }
      return true;
    });
    
    if (!hasRequiredFields) {
      console.warn(`${type} data missing required fields:`, data);
      // Transform data if needed
      if (type === 'revenue_by_department' && typeof data === 'object' && data !== null) {
        return Object.keys(data).map(key => ({
          department: key,
          revenue: data[key]
        })).filter(item => typeof item.revenue === 'number');
      } else if (type === 'monthly_revenue' && typeof data === 'object' && data !== null) {
        return Object.keys(data).map(key => ({
          month: key,
          revenue: data[key]
        })).filter(item => typeof item.revenue === 'number');
      } else if (type === 'parts_revenue_analysis' && typeof data === 'object' && data !== null) {
        return Object.keys(data).map(key => ({
          name: key,
          revenue: data[key]
        })).filter(item => typeof item.revenue === 'number');
      }
    }
    
    return data;
  };
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filters, setFilters] = useState({
    dateFrom: '',
    dateTo: '',
    month: '',
    year: ''
  });
  const [serviceChargeDetails, setServiceChargeDetails] = useState([]);
  const [showServiceChargeModal, setShowServiceChargeModal] = useState(false);
  const [partsRevenueDetails, setPartsRevenueDetails] = useState([]);
  const [showPartsRevenueModal, setShowPartsRevenueModal] = useState(false);

  const navigate = useNavigate();

  // Check authentication
  useEffect(() => {
    const storedAdmin = localStorage.getItem('admin');
    if (!storedAdmin) {
      navigate('/admin/login');
    }
  }, [navigate]);



  // Fetch financial data from the backend
  const fetchData = async (filterParams = filters) => {
    try {
      setLoading(true);
      // Build query string from filters
      const queryParams = new URLSearchParams();
      console.log('Sending filters to API:', filterParams);
      if (filterParams.dateFrom) queryParams.append('dateFrom', filterParams.dateFrom);
      if (filterParams.dateTo) queryParams.append('dateTo', filterParams.dateTo);

      if (filterParams.month) queryParams.append('month', filterParams.month);
      if (filterParams.year) queryParams.append('year', filterParams.year);
      
      const queryString = queryParams.toString();
      const url = queryString ? `/dashboard/financials?${queryString}` : '/dashboard/financials';
      
      const res = await api.get(url);
      console.log('Financial data received:', res.data);
      
      // Validate and transform data if needed
      const validatedData = {
        revenue_by_department: validateChartData(res.data.revenue_by_department, 'revenue_by_department'),
        monthly_revenue: validateChartData(res.data.monthly_revenue, 'monthly_revenue'),
        parts_cost_analysis: res.data.parts_cost_analysis || [],
        parts_revenue_analysis: validateChartData(res.data.parts_revenue_analysis, 'parts_revenue_analysis'),
        transaction_revenue_by_department: res.data.transaction_revenue_by_department || [],
        transaction_monthly_revenue: res.data.transaction_monthly_revenue || [],
        total_jobs_revenue: res.data.total_jobs_revenue || 0,
        total_service_charges: res.data.total_service_charges || 0
      };
      
      // Add service charge details and total service charges to the validated data
      validatedData.service_charge_details = res.data.service_charge_details || [];
      validatedData.total_service_charges = res.data.total_service_charges || 0;
      
      console.log('Validated financial data:', validatedData);
      setFinancialData(validatedData);
      
      // Also update service charge details in state if available
      if (res.data.service_charge_details) {
        setServiceChargeDetails(res.data.service_charge_details);
      }
    } catch (err) {
      console.error(err);
      setError('Failed to fetch financial data');
    } finally {
      setLoading(false);
    }
  };
  
  // Initial data fetch
  useEffect(() => {
    fetchData();
  }, []);
  
  // Handle filter changes
  const handleFilterChange = (name, value) => {
    setFilters(prev => ({
      ...prev,
      [name]: value
    }));
  };
  
  // Handle date range change
  const handleDateRangeChange = (from, to) => {
    setFilters(prev => ({
      ...prev,
      dateFrom: from,
      dateTo: to
    }));
  };
  
  // Function to fetch detailed service charge data
  const fetchServiceChargeDetails = async () => {
    try {
      setLoading(true);
      // Build query string from filters
      const queryParams = new URLSearchParams();
      if (filters.dateFrom) queryParams.append('dateFrom', filters.dateFrom);
      if (filters.dateTo) queryParams.append('dateTo', filters.dateTo);
      if (filters.month) queryParams.append('month', filters.month);
      if (filters.year) queryParams.append('year', filters.year);
      
      const queryString = queryParams.toString();
      const url = queryString ? `/dashboard/service-charges-details?${queryString}` : '/dashboard/service-charges-details';
      
      const res = await api.get(url);
      setServiceChargeDetails(res.data);
      setShowServiceChargeModal(true);
    } catch (err) {
      console.error('Error fetching service charge details:', err);
      setError('Failed to fetch service charge details');
    } finally {
      setLoading(false);
    }
  };
  
  // Function to fetch detailed parts revenue data
  const fetchPartsRevenueDetails = async () => {
    try {
      setLoading(true);
      // Build query string from filters
      const queryParams = new URLSearchParams();
      if (filters.dateFrom) queryParams.append('dateFrom', filters.dateFrom);
      if (filters.dateTo) queryParams.append('dateTo', filters.dateTo);
      if (filters.month) queryParams.append('month', filters.month);
      if (filters.year) queryParams.append('year', filters.year);
      
      const queryString = queryParams.toString();
      const url = queryString ? `/dashboard/parts-revenue-details?${queryString}` : '/dashboard/parts-revenue-details';
      
      const res = await api.get(url);
      setPartsRevenueDetails(res.data);
      setShowPartsRevenueModal(true);
    } catch (err) {
      console.error('Error fetching parts revenue details:', err);
      setError('Failed to fetch parts revenue details');
    } finally {
      setLoading(false);
    }
  };
  
  // Reset filters
  const resetFilters = () => {
    setFilters({
      dateFrom: '',
      dateTo: '',
      month: '',
      year: ''
    });
  };
  
  // Function to download service charge details as Excel
  const downloadServiceChargesExcel = () => {
    if (!serviceChargeDetails.details || serviceChargeDetails.details.length === 0) {
      setError('No data available to download');
      return;
    }
    
    // Create worksheet from service charge details
    const worksheetData = serviceChargeDetails.details.map((detail, index) => ({
      'S.No': index + 1,
      'Job ID': detail.jobId,
      'Customer Name': detail.customerName,
      'Date': new Date(detail.date).toLocaleDateString(),
      'Service Charge': `Rs ${detail.serviceChargeAmount}`
    }));
    
    // Add total row
    worksheetData.push({
      'S.No': '',
      'Job ID': '',
      'Customer Name': 'TOTAL',
      'Date': '',
      'Service Charge': `Rs ${serviceChargeDetails.totalServiceCharge || 0}`
    });
    
    const worksheet = XLSX.utils.json_to_sheet(worksheetData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Service Charges');
    
    // Generate file name with current date
    const fileName = `Service-Charges-${new Date().toISOString().split('T')[0]}.xlsx`;
    XLSX.writeFile(workbook, fileName);
  };
  
  // Function to download service charge details as PDF
  const downloadServiceChargesPDF = () => {
    if (!serviceChargeDetails.details || serviceChargeDetails.details.length === 0) {
      setError('No data available to download');
      return;
    }
    
    const doc = new jsPDF();
    
    // Title
    doc.setFontSize(18);
    doc.text('Service Charges Details', 14, 20);
    
    // Date range if available
    if (filters.dateFrom && filters.dateTo) {
      doc.setFontSize(12);
      doc.text(`Date Range: ${filters.dateFrom} to ${filters.dateTo}`, 14, 30);
    }
    
    // Table
    const tableColumn = ['S.No', 'Job ID', 'Customer Name', 'Date', 'Service Charge'];
    const tableRows = serviceChargeDetails.details.map((detail, index) => [
      index + 1,
      detail.jobId,
      detail.customerName,
      new Date(detail.date).toLocaleDateString(),
      `Rs ${detail.serviceChargeAmount}`
    ]);
    
    // Add total row
    tableRows.push(['', '', 'TOTAL', '', `Rs ${serviceChargeDetails.totalServiceCharge || 0}`]);
    
    // Add table using autoTable function
    autoTable(doc, {
      head: [tableColumn],
      body: tableRows,
      startY: filters.dateFrom && filters.dateTo ? 35 : 25,
      styles: {
        fontSize: 10,
      },
      headStyles: {
        fillColor: [59, 130, 246], // blue-500
      },
      alternateRowStyles: {
        fillColor: [241, 245, 249] // gray-100
      }
    });
    
    // Save the PDF
    doc.save(`Service-Charges-${new Date().toISOString().split('T')[0]}.pdf`);
  };
  
  // Function to download parts revenue details as Excel
  const downloadPartsRevenueExcel = () => {
    if (!partsRevenueDetails.details || partsRevenueDetails.details.length === 0) {
      setError('No data available to download');
      return;
    }
    
    // Create worksheet from parts revenue details
    const worksheetData = partsRevenueDetails.details.map((detail, index) => ({
      'S.No': index + 1,
      'Job ID': detail.jobId,
      'Customer Name': detail.customerName,
      'Date': new Date(detail.date).toLocaleDateString(),
      'Part Name': detail.partName,
      'Quantity': detail.quantity,
      'Revenue': `Rs ${detail.totalRevenue}`
    }));
    
    // Add total row
    worksheetData.push({
      'S.No': '',
      'Job ID': '',
      'Customer Name': 'TOTAL',
      'Date': '',
      'Part Name': '',
      'Quantity': '',
      'Revenue': `Rs ${partsRevenueDetails.totalPartsRevenue || 0}`
    });
    
    const worksheet = XLSX.utils.json_to_sheet(worksheetData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Parts Revenue');
    
    // Generate file name with current date
    const fileName = `Parts-Revenue-${new Date().toISOString().split('T')[0]}.xlsx`;
    XLSX.writeFile(workbook, fileName);
  };
  
  // Function to download parts revenue details as PDF
  const downloadPartsRevenuePDF = () => {
    if (!partsRevenueDetails.details || partsRevenueDetails.details.length === 0) {
      setError('No data available to download');
      return;
    }
    
    const doc = new jsPDF();
    
    // Title
    doc.setFontSize(18);
    doc.text('Parts Revenue Details', 14, 20);
    
    // Date range if available
    if (filters.dateFrom && filters.dateTo) {
      doc.setFontSize(12);
      doc.text(`Date Range: ${filters.dateFrom} to ${filters.dateTo}`, 14, 30);
    }
    
    // Table
    const tableColumn = ['S.No', 'Job ID', 'Customer Name', 'Date', 'Part Name', 'Quantity', 'Revenue'];
    const tableRows = partsRevenueDetails.details.map((detail, index) => [
      index + 1,
      detail.jobId,
      detail.customerName,
      new Date(detail.date).toLocaleDateString(),
      detail.partName,
      detail.quantity,
      `Rs ${detail.totalRevenue}`
    ]);
    
    // Add total row
    tableRows.push(['', '', 'TOTAL', '', '', '', `Rs ${partsRevenueDetails.totalPartsRevenue || 0}`]);
    
    // Add table using autoTable function
    autoTable(doc, {
      head: [tableColumn],
      body: tableRows,
      startY: filters.dateFrom && filters.dateTo ? 35 : 25,
      styles: {
        fontSize: 10,
      },
      headStyles: {
        fillColor: [59, 130, 246], // blue-500
      },
      alternateRowStyles: {
        fillColor: [241, 245, 249] // gray-100
      }
    });
    
    // Save the PDF
    doc.save(`Parts-Revenue-${new Date().toISOString().split('T')[0]}.pdf`);
  };

  // Format currency
  const formatCurrency = (amount) => {
    return `Rs ${Number(amount).toFixed(2)}`;
  };

  // Calculate trend direction and percentage change
  const calculateTrend = (data, key) => {
    if (!data || data.length < 2) return { direction: 0, percentage: 0 };
    
    const sortedData = [...data].sort((a, b) => {
      // Sort by month if it's monthly data, otherwise by department/revenue
      if (a.month && b.month) {
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        return months.indexOf(a.month) - months.indexOf(b.month);
      }
      return 0;
    });
    
    const current = sortedData[sortedData.length - 1][key];
    const previous = sortedData[sortedData.length - 2][key];
    
    if (!previous || previous === 0) return { direction: current > 0 ? 1 : 0, percentage: 0 };
    
    const change = current - previous;
    const percentage = ((change / Math.abs(previous)) * 100).toFixed(2);
    
    return {
      direction: change > 0 ? 1 : change < 0 ? -1 : 0,
      percentage: Math.abs(parseFloat(percentage))
    };
  };

  // Render trend indicator
  const renderTrendIndicator = (data, key) => {
    const trend = calculateTrend(data, key);
    
    if (trend.direction === 0) return null;
    
    return (
      <div className={`inline-flex items-center mt-1 ${trend.direction > 0 ? 'text-green-600' : 'text-red-600'}`}>
        {trend.direction > 0 ? (
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M5.293 9.707a1 1 0 010-1.414l4-4a1 1 0 011.414 0l4 4a1 1 0 01-1.414 1.414L11 7.414V15a1 1 0 11-2 0V7.414L6.707 9.707a1 1 0 01-1.414 0z" clipRule="evenodd" />
          </svg>
        ) : (
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M14.707 10.293a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 111.414-1.414L9 12.586V5a1 1 0 012 0v7.586l2.293-2.293a1 1 0 011.414 0z" clipRule="evenodd" />
          </svg>
        )}
        <span className="text-xs font-medium">{trend.percentage}%</span>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="p-4 md:p-8 bg-gray-100 min-h-screen flex items-center justify-center">
        <div className="text-xl">Loading financial data...</div>
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
    <div className="p-2 md:p-4 lg:p-8 bg-gray-100 min-h-screen">
      <div className="mb-4 md:mb-8">
        <h1 className="text-xl md:text-2xl lg:text-3xl font-bold text-gray-900">Financial Dashboard</h1>
        <p className="text-sm md:text-base text-gray-600">Overview of your repair shop's financial performance</p>
      </div>
      
      {/* Filter Controls */}
      <div className="bg-white rounded-lg shadow mb-4 md:mb-8 p-3 md:p-6">
        <h2 className="text-lg md:text-xl font-semibold text-gray-800 mb-3 md:mb-4">Filters</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2 md:gap-4 mb-3 md:mb-4">
          <div>
            <label className="block text-xs md:text-sm font-medium text-gray-700 mb-1">Date From</label>
            <input
              type="date"
              value={filters.dateFrom}
              onChange={(e) => handleFilterChange('dateFrom', e.target.value)}
              className="w-full px-2 py-1 md:px-3 md:py-2 text-xs md:text-sm border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          <div>
            <label className="block text-xs md:text-sm font-medium text-gray-700 mb-1">Date To</label>
            <input
              type="date"
              value={filters.dateTo}
              onChange={(e) => handleFilterChange('dateTo', e.target.value)}
              className="w-full px-2 py-1 md:px-3 md:py-2 text-xs md:text-sm border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          <div>
            <label className="block text-xs md:text-sm font-medium text-gray-700 mb-1">Month</label>
            <select
              value={filters.month}
              onChange={(e) => handleFilterChange('month', e.target.value)}
              className="w-full px-2 py-1 md:px-3 md:py-2 text-xs md:text-sm border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="">All Months</option>
              <option value="01">January</option>
              <option value="02">February</option>
              <option value="03">March</option>
              <option value="04">April</option>
              <option value="05">May</option>
              <option value="06">June</option>
              <option value="07">July</option>
              <option value="08">August</option>
              <option value="09">September</option>
              <option value="10">October</option>
              <option value="11">November</option>
              <option value="12">December</option>
            </select>
          </div>
          <div>
            <label className="block text-xs md:text-sm font-medium text-gray-700 mb-1">Year</label>
            <input
              type="number"
              value={filters.year}
              onChange={(e) => handleFilterChange('year', e.target.value)}
              placeholder="YYYY"
              className="w-full px-2 py-1 md:px-3 md:py-2 text-xs md:text-sm border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
        </div>

        <div className="flex flex-col sm:flex-row space-y-2 sm:space-y-0 sm:space-x-4">
          <button
            type="button"
            onClick={() => fetchData()}
            className="px-3 py-1.5 md:px-4 md:py-2 bg-blue-600 text-white text-sm md:text-base rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
          >
            Apply Filters
          </button>
          <button
            type="button"
            onClick={resetFilters}
            className="px-3 py-1.5 md:px-4 md:py-2 bg-gray-500 text-white text-sm md:text-base rounded-md hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2"
          >
            Reset Filters
          </button>
        </div>
      </div>
      
      {/* Revenue Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 md:gap-6 mb-4 md:mb-8">
        <div className="bg-gradient-to-r from-green-50 to-emerald-50 rounded-lg shadow p-4 md:p-6 border border-green-100">
          <h3 className="text-sm md:text-lg font-medium text-gray-900">Total Jobs Revenue</h3>
          <p className="text-lg md:text-2xl font-bold text-green-600">{formatCurrency(financialData.total_jobs_revenue || 0)}</p>
        </div>
        <div className="bg-gradient-to-r from-blue-50 to-sky-50 rounded-lg shadow p-4 md:p-6 border border-blue-100 cursor-pointer hover:shadow-md transition-shadow duration-200" onClick={fetchServiceChargeDetails}>
          <h3 className="text-sm md:text-lg font-medium text-gray-900">Service Charges</h3>
          <p className="text-lg md:text-2xl font-bold text-blue-600">{formatCurrency(financialData.total_service_charges || 0)}</p>
        </div>
        <div className="bg-gradient-to-r from-purple-50 to-violet-50 rounded-lg shadow p-4 md:p-6 border border-purple-100 cursor-pointer hover:shadow-md transition-shadow duration-200" onClick={fetchPartsRevenueDetails}>
          <h3 className="text-sm md:text-lg font-medium text-gray-900">Parts Revenue</h3>
          <p className="text-lg md:text-2xl font-bold text-purple-600">{formatCurrency((financialData.parts_revenue_analysis || []).reduce((sum, item) => sum + (item.revenue || 0), 0))}</p>
        </div>
        <div className="bg-gradient-to-r from-amber-50 to-orange-50 rounded-lg shadow p-4 md:p-6 border border-amber-100">
          <h3 className="text-sm md:text-lg font-medium text-gray-900">Total Transactions</h3>
          <p className="text-lg md:text-2xl font-bold text-amber-600">{formatCurrency((financialData.transaction_revenue_by_department || []).reduce((sum, item) => sum + (item.revenue || 0), 0))}</p>
        </div>
      </div>

      {/* Revenue by Department */}
      <div className="bg-white rounded-lg shadow mb-4 md:mb-8 p-3 md:p-6">
        <h2 className="text-lg md:text-xl font-semibold text-gray-800 mb-3 md:mb-4">Revenue by Department</h2>
        <div className="h-60 md:h-80">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart
              data={financialData.revenue_by_department && Array.isArray(financialData.revenue_by_department) ? financialData.revenue_by_department : []}
              margin={{ top: 20, right: 30, left: 20, bottom: 60 }}
              style={{ background: '#ffffff', borderRadius: '8px' }}
              animationBegin={300}
              animationDuration={1000}
              animationEasing="ease-out"
            >
              <CartesianGrid stroke="#f0f0f0" strokeDasharray="3 3" vertical={false} />
              <XAxis 
                dataKey="department" 
                angle={-45} 
                textAnchor="end" 
                height={60}
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 10, fill: '#666' }}
              />
              <YAxis 
                tickFormatter={(value) => `Rs ${value.toLocaleString()}`} 
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 10, fill: '#666' }}
              />
              <Tooltip 
                contentStyle={{ 
                  backgroundColor: '#1f2937', 
                  border: 'none', 
                  borderRadius: '8px', 
                  boxShadow: '0 4px 12px rgba(0,0,0,0.25)',
                  color: '#fff'
                }}
                formatter={(value) => [`Rs ${value.toLocaleString()}`, 'Revenue']}
                labelStyle={{ fontWeight: 'bold', color: '#d1d5db' }}
                cursor={{ stroke: '#9ca3af', strokeDasharray: '2 2' }}
              />
              <Legend />
              <Area 
                type="monotone" 
                dataKey="revenue" 
                fill="url(#colorGradientBlue)" 
                stroke="#3b82f6" 
                strokeWidth={2} 
                name="Revenue" 
                dot={{ stroke: '#3b82f6', strokeWidth: 2, r: 3, fill: '#fff' }}
                animationBegin={400}
                animationDuration={800}
                animationEasing="ease-out"
              />
              <Line 
                type="monotone" 
                dataKey="revenue" 
                stroke="#1d4ed8" 
                strokeWidth={2} 
                dot={{ r: 4, stroke: '#1d4ed8', strokeWidth: 2, fill: '#fff' }} 
                activeDot={{ r: 6, stroke: '#1e40af', strokeWidth: 2, fill: '#fff' }} 
                name="Revenue" 
                animationBegin={400}
                animationDuration={800}
                animationEasing="ease-out"
              />
              <defs>
                <linearGradient id="colorGradientBlue" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.05}/>
                </linearGradient>
              </defs>
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Monthly Revenue Trend */}
      <div className="bg-white rounded-lg shadow mb-4 md:mb-8 p-3 md:p-6">
        <h2 className="text-lg md:text-xl font-semibold text-gray-800 mb-3 md:mb-4">Monthly Revenue Trend</h2>
        <div className="h-60 md:h-80">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart
              data={financialData.monthly_revenue && Array.isArray(financialData.monthly_revenue) ? financialData.monthly_revenue : []}
              margin={{ top: 20, right: 30, left: 20, bottom: 60 }}
              style={{ background: '#ffffff', borderRadius: '8px' }}
              animationBegin={300}
              animationDuration={1000}
              animationEasing="ease-out"
            >
              <CartesianGrid stroke="#f0f0f0" strokeDasharray="3 3" vertical={false} />
              <XAxis 
                dataKey="month" 
                angle={-45} 
                textAnchor="end" 
                height={60}
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 10, fill: '#666' }}
              />
              <YAxis 
                tickFormatter={(value) => `Rs ${value.toLocaleString()}`} 
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 10, fill: '#666' }}
              />
              <Tooltip 
                contentStyle={{ 
                  backgroundColor: '#1f2937', 
                  border: 'none', 
                  borderRadius: '8px', 
                  boxShadow: '0 4px 12px rgba(0,0,0,0.25)',
                  color: '#fff'
                }}
                formatter={(value) => [`Rs ${value.toLocaleString()}`, 'Revenue']}
                labelStyle={{ fontWeight: 'bold', color: '#d1d5db' }}
                cursor={{ stroke: '#9ca3af', strokeDasharray: '2 2' }}
              />
              <Legend />
              <Area 
                type="monotone" 
                dataKey="revenue" 
                fill="url(#colorGradientGreen)" 
                stroke="#10b981" 
                strokeWidth={2} 
                name="Revenue" 
                dot={{ stroke: '#10b981', strokeWidth: 2, r: 3, fill: '#fff' }}
                animationBegin={400}
                animationDuration={800}
                animationEasing="ease-out"
              />
              <Line 
                type="monotone" 
                dataKey="revenue" 
                stroke="#047857" 
                strokeWidth={2} 
                dot={{ r: 4, stroke: '#047857', strokeWidth: 2, fill: '#fff' }} 
                activeDot={{ r: 6, stroke: '#047857', strokeWidth: 2, fill: '#fff' }} 
                name="Revenue" 
                animationBegin={400}
                animationDuration={800}
                animationEasing="ease-out"
              />
              <defs>
                <linearGradient id="colorGradientGreen" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0.05}/>
                </linearGradient>
              </defs>
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
      
      {/* Parts Revenue Analysis */}
      <div className="bg-white rounded-lg shadow mb-4 md:mb-8 p-3 md:p-6">
        <h2 className="text-lg md:text-xl font-semibold text-gray-800 mb-3 md:mb-4">Parts Revenue Analysis</h2>
        <div className="h-60 md:h-80">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart
              data={financialData.parts_revenue_analysis && Array.isArray(financialData.parts_revenue_analysis) ? financialData.parts_revenue_analysis : []}
              margin={{ top: 20, right: 30, left: 20, bottom: 60 }}
              style={{ background: '#ffffff', borderRadius: '8px' }}
              animationBegin={300}
              animationDuration={1000}
              animationEasing="ease-out"
            >
              <CartesianGrid stroke="#f0f0f0" strokeDasharray="3 3" vertical={false} />
              <XAxis 
                dataKey="name" 
                angle={-45} 
                textAnchor="end" 
                height={60}
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 10, fill: '#666' }}
              />
              <YAxis 
                tickFormatter={(value) => `Rs ${value.toLocaleString()}`} 
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 10, fill: '#666' }}
              />
              <Tooltip 
                contentStyle={{ 
                  backgroundColor: '#1f2937', 
                  border: 'none', 
                  borderRadius: '8px', 
                  boxShadow: '0 4px 12px rgba(0,0,0,0.25)',
                  color: '#fff'
                }}
                formatter={(value) => [`Rs ${value.toLocaleString()}`, 'Revenue']}
                labelStyle={{ fontWeight: 'bold', color: '#d1d5db' }}
                cursor={{ stroke: '#9ca3af', strokeDasharray: '2 2' }}
              />
              <Legend />
              <Area 
                type="monotone" 
                dataKey="revenue" 
                fill="url(#colorGradientPurple)" 
                stroke="#8b5cf6" 
                strokeWidth={2} 
                name="Revenue" 
                dot={{ stroke: '#8b5cf6', strokeWidth: 2, r: 3, fill: '#fff' }}
                animationBegin={400}
                animationDuration={800}
                animationEasing="ease-out"
              />
              <Line 
                type="monotone" 
                dataKey="revenue" 
                stroke="#7c3aed" 
                strokeWidth={2} 
                dot={{ r: 4, stroke: '#7c3aed', strokeWidth: 2, fill: '#fff' }} 
                activeDot={{ r: 6, stroke: '#6d28d9', strokeWidth: 2, fill: '#fff' }} 
                name="Revenue" 
                animationBegin={400}
                animationDuration={800}
                animationEasing="ease-out"
              />
              <defs>
                <linearGradient id="colorGradientPurple" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.3}/>
                  <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0.05}/>
                </linearGradient>
              </defs>
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Parts Cost Analysis */}
      <div className="bg-white rounded-lg shadow p-3 md:p-6">
        <h2 className="text-lg md:text-xl font-semibold text-gray-800 mb-3 md:mb-4">Parts Cost Analysis</h2>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th scope="col" className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider md:px-6 md:py-3">Part Name</th>
                <th scope="col" className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider md:px-6 md:py-3">Category</th>
                <th scope="col" className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider md:px-6 md:py-3">Stock</th>
                <th scope="col" className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider md:px-6 md:py-3">Cost Price</th>
                <th scope="col" className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider md:px-6 md:py-3">Selling Price</th>
                <th scope="col" className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider md:px-6 md:py-3">Profit Margin</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {(financialData.parts_cost_analysis || []).length === 0 ? (
                <tr>
                  <td colSpan="6" className="px-3 py-2 text-center text-gray-500 md:px-6 md:py-4">
                    No parts data available
                  </td>
                </tr>
              ) : (
                (financialData.parts_cost_analysis || []).map((part) => (
                  <tr key={part._id}>
                    <td className="px-3 py-2 text-sm font-medium text-gray-900 md:px-6 md:py-4 whitespace-normal break-words">{part.name}</td>
                    <td className="px-3 py-2 text-sm text-gray-500 md:px-6 md:py-4 whitespace-normal break-words">{part.category}</td>
                    <td className="px-3 py-2 text-sm text-gray-500 md:px-6 md:py-4 whitespace-nowrap">{part.stock}</td>
                    <td className="px-3 py-2 text-sm text-gray-500 md:px-6 md:py-4 whitespace-nowrap">{formatCurrency(part.cost_price)}</td>
                    <td className="px-3 py-2 text-sm text-gray-500 md:px-6 md:py-4 whitespace-nowrap">{formatCurrency(part.selling_price)}</td>
                    <td className="px-3 py-2 text-sm text-gray-500 md:px-6 md:py-4 whitespace-nowrap">
                      <span className={part.profit_margin >= 0 ? 'text-green-600' : 'text-red-600'}>
                        {part.profit_margin >= 0 ? '+' : ''}{part.profit_margin}%
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
      
      {/* Service Charge Details Modal */}
      {showServiceChargeModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
            <div className="flex justify-between items-center p-6 border-b">
              <h2 className="text-xl font-bold text-gray-800">Service Charge Details</h2>
              <div className="flex space-x-3">
                <button
                  type="button"
                  onClick={downloadServiceChargesPDF}
                  className="px-3 py-1.5 bg-red-600 text-white text-sm rounded-md hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 inline-flex items-center"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                  </svg>
                  PDF
                </button>
                <button
                  type="button"
                  onClick={downloadServiceChargesExcel}
                  className="px-3 py-1.5 bg-green-600 text-white text-sm rounded-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 inline-flex items-center"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  Excel
                </button>
                <button 
                  onClick={() => setShowServiceChargeModal(false)}
                  className="text-gray-500 hover:text-gray-700 ml-2"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
            
            <div className="overflow-y-auto flex-grow">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50 sticky top-0">
                    <tr>
                      <th scope="col" className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider sm:px-6 sm:py-3">Job ID</th>
                      <th scope="col" className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider sm:px-6 sm:py-3">Customer Name</th>
                      <th scope="col" className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider sm:px-6 sm:py-3">Date</th>
                      <th scope="col" className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider sm:px-6 sm:py-3">Service Charge</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {serviceChargeDetails.details && serviceChargeDetails.details.length > 0 ? (
                      serviceChargeDetails.details.map((detail, index) => (
                        <tr key={index} className="hover:bg-gray-50">
                          <td className="px-3 py-2 text-sm font-medium text-gray-900 sm:px-6 sm:py-4 whitespace-normal break-words">{detail.jobId}</td>
                          <td className="px-3 py-2 text-sm text-gray-500 sm:px-6 sm:py-4 whitespace-normal break-words">{detail.customerName}</td>
                          <td className="px-3 py-2 text-sm text-gray-500 sm:px-6 sm:py-4 whitespace-normal break-words">
                            {new Date(detail.date).toLocaleDateString()}
                          </td>
                          <td className="px-3 py-2 text-sm text-gray-500 sm:px-6 sm:py-4 whitespace-normal break-words">{formatCurrency(detail.serviceChargeAmount)}</td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan="4" className="px-6 py-4 text-center text-gray-500">
                          No service charge details found
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
            
            {serviceChargeDetails.totalServiceCharge !== undefined && (
              <div className="p-6 border-t bg-gray-50">
                <div className="flex justify-between items-center">
                  <span className="text-lg font-semibold text-gray-700">Total Service Charges:</span>
                  <span className="text-xl font-bold text-blue-600">
                    {formatCurrency(serviceChargeDetails.totalServiceCharge)}
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
      
      {/* Parts Revenue Details Modal */}
      {showPartsRevenueModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
            <div className="flex justify-between items-center p-6 border-b">
              <h2 className="text-xl font-bold text-gray-800">Parts Revenue Details</h2>
              <div className="flex space-x-3">
                <button
                  type="button"
                  onClick={downloadPartsRevenuePDF}
                  className="px-3 py-1.5 bg-red-600 text-white text-sm rounded-md hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 inline-flex items-center"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                  </svg>
                  PDF
                </button>
                <button
                  type="button"
                  onClick={downloadPartsRevenueExcel}
                  className="px-3 py-1.5 bg-green-600 text-white text-sm rounded-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 inline-flex items-center"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  Excel
                </button>
                <button 
                  onClick={() => setShowPartsRevenueModal(false)}
                  className="text-gray-500 hover:text-gray-700 ml-2"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
            
            <div className="overflow-y-auto flex-grow">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50 sticky top-0">
                    <tr>
                      <th scope="col" className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider sm:px-6 sm:py-3">Job ID</th>
                      <th scope="col" className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider sm:px-6 sm:py-3">Customer Name</th>
                      <th scope="col" className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider sm:px-6 sm:py-3">Date</th>
                      <th scope="col" className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider sm:px-6 sm:py-3">Part Name</th>
                      <th scope="col" className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider sm:px-6 sm:py-3">Quantity</th>
                      <th scope="col" className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider sm:px-6 sm:py-3">Revenue</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {partsRevenueDetails.details && partsRevenueDetails.details.length > 0 ? (
                      partsRevenueDetails.details.map((detail, index) => (
                        <tr key={index} className="hover:bg-gray-50">
                          <td className="px-3 py-2 text-sm font-medium text-gray-900 sm:px-6 sm:py-4 whitespace-normal break-words">{detail.jobId}</td>
                          <td className="px-3 py-2 text-sm text-gray-500 sm:px-6 sm:py-4 whitespace-normal break-words">{detail.customerName}</td>
                          <td className="px-3 py-2 text-sm text-gray-500 sm:px-6 sm:py-4 whitespace-normal break-words">
                            {new Date(detail.date).toLocaleDateString()}
                          </td>
                          <td className="px-3 py-2 text-sm text-gray-500 sm:px-6 sm:py-4 whitespace-normal break-words">{detail.partName}</td>
                          <td className="px-3 py-2 text-sm text-gray-500 sm:px-6 sm:py-4 whitespace-normal break-words">{detail.quantity}</td>
                          <td className="px-3 py-2 text-sm text-gray-500 sm:px-6 sm:py-4 whitespace-normal break-words">{formatCurrency(detail.totalRevenue)}</td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan="6" className="px-6 py-4 text-center text-gray-500">
                          No parts revenue details found
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
            
            {partsRevenueDetails.totalPartsRevenue !== undefined && (
              <div className="p-6 border-t bg-gray-50">
                <div className="flex justify-between items-center">
                  <span className="text-lg font-semibold text-gray-700">Total Parts Revenue:</span>
                  <span className="text-xl font-bold text-purple-600">
                    {formatCurrency(partsRevenueDetails.totalPartsRevenue)}
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default Financials;