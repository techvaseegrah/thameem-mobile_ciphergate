const { Customer } = require('../models/Schemas');
const XLSX = require('xlsx');

// Get all customers for directory/export
exports.getAllCustomers = async (req, res) => {
  try {
    // Extract date range filters from query parameters
    const { startDate, endDate, search } = req.query;
    
    // Build filter object
    const filter = {};
    
    if (startDate) {
      filter.createdAt = { ...filter.createdAt, $gte: new Date(startDate) };
    }
    
    if (endDate) {
      filter.createdAt = { ...filter.createdAt, $lte: new Date(endDate) };
    }
    
    // Add search functionality
    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { phone: { $regex: search, $options: 'i' } }
      ];
    }
    
    const customers = await Customer.find(filter, 'name phone createdAt')
      .sort({ name: 1 });
    
    res.json({
      success: true,
      count: customers.length,
      customers: customers
    });
  } catch (error) {
    console.error('Error fetching customers:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch customers'
    });
  }
};

// Get customers for Excel export (same data, different format)
exports.getCustomersForExport = async (req, res) => {
  try {
    const customers = await Customer.find({}, 'name phone')
      .sort({ name: 1 });
    
    // Format data for Excel export
    const exportData = customers.map(customer => ({
      'Customer Name': customer.name,
      'Phone Number': customer.phone,
      'Email': customer.email || '',
      'Address': customer.address || ''
    }));
    
    res.json({
      success: true,
      count: customers.length,
      data: exportData,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error preparing customer export data:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to prepare export data'
    });
  }
};

// Export customers to Excel file
exports.exportCustomersToExcel = async (req, res) => {
  try {
    // Extract date range filters from query parameters
    const { startDate, endDate } = req.query;
    
    // Build filter object
    const filter = {};
    
    if (startDate) {
      filter.createdAt = { ...filter.createdAt, $gte: new Date(startDate) };
    }
    
    if (endDate) {
      filter.createdAt = { ...filter.createdAt, $lte: new Date(endDate) };
    }
    
    const customers = await Customer.find(filter, 'name phone createdAt')
      .sort({ name: 1 });
    
    // Prepare data for Excel (only name and phone for WhatsApp bulk messaging)
    const excelData = customers.map((customer, index) => ({
      'S.No': index + 1,
      'Customer Name': customer.name,
      'Phone Number': customer.phone,
      'Date Added': customer.createdAt ? new Date(customer.createdAt).toLocaleDateString() : 'N/A'
    }));
    
    // Create workbook and worksheet
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(excelData);
    
    // Set column widths
    const colWidths = [
      { wch: 5 },   // S.No
      { wch: 25 },  // Customer Name
      { wch: 15 },  // Phone Number
      { wch: 12 }   // Date Added
    ];
    ws['!cols'] = colWidths;
    
    // Add worksheet to workbook
    XLSX.utils.book_append_sheet(wb, ws, 'Customers');
    
    // Generate buffer
    const excelBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'buffer' });
    
    // Set headers for file download
    const timestamp = new Date().toISOString().split('T')[0];
    const filename = `customers_export_${timestamp}.xlsx`;
    
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=${filename}`);
    
    // Send the Excel file
    res.send(excelBuffer);
    
  } catch (error) {
    console.error('Error exporting customers to Excel:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to export customers to Excel'
    });
  }
};