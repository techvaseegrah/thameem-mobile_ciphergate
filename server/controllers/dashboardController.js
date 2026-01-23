const { Job, Customer, Part } = require('../models/Schemas');
const Transaction = require('../models/Transaction');

// GET /api/dashboard/summary
exports.getDashboardSummary = async (req, res) => {
  try {
    // Get today's date range
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    
    const endOfDay = new Date();
    endOfDay.setHours(23, 59, 59, 999);

    // Use Promise.all to fetch all data concurrently
    const [
      totalRevenueToday,
      activeJobsCount,
      jobsReadyForPickup,
      lowStockCount,
      recentJobs
    ] = await Promise.all([
      // Total revenue today (sum of 'Income' transactions where date == today)
      Transaction.aggregate([
        {
          $match: {
            type: 'Income',
            date: {
              $gte: startOfDay,
              $lte: endOfDay
            }
          }
        },
        {
          $group: {
            _id: null,
            total: { $sum: '$amount' }
          }
        }
      ]).then(result => result.length > 0 ? result[0].total : 0),

      // Active jobs count (jobs where status != 'Picked Up')
      Job.countDocuments({ status: { $ne: 'Picked Up' } }),

      // Jobs ready for pickup (jobs where status == 'Done')
      Job.countDocuments({ status: 'Done' }),

      // Low stock count (parts where stock <= min_stock_alert)
      Part.countDocuments({ 
        $expr: { 
          $lte: ['$stock', '$min_stock_alert'] 
        }
      }),

      // Recent jobs (5 most recently created jobs with populated customer and taken_by_worker)
      Job.find()
        .sort({ repair_job_taken_time: -1 })
        .limit(5)
        .populate('customer', 'name')
        .populate('taken_by_worker', 'name')
    ]);

    res.json({
      total_revenue_today: totalRevenueToday,
      active_jobs_count: activeJobsCount,
      jobs_ready_for_pickup: jobsReadyForPickup,
      low_stock_count: lowStockCount,
      recent_jobs: recentJobs
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// GET /api/dashboard/financials
exports.getFinancialData = async (req, res) => {
  try {
    // Get query parameters for filtering
    const { dateFrom, dateTo, department, part, serviceCharge, month, year } = req.query;
    
    // Build date filter
    let dateFilter = {};
    
    // Apply date range filter if both dates are provided
    if (dateFrom && dateTo) {
      dateFilter.repair_job_taken_time = {
        $gte: new Date(dateFrom),
        $lte: new Date(dateTo)
      };
    } else if (dateFrom) {
      // Apply from date only
      dateFilter.repair_job_taken_time = {
        $gte: new Date(dateFrom)
      };
    } else if (dateTo) {
      // Apply to date only
      dateFilter.repair_job_taken_time = {
        $lte: new Date(dateTo)
      };
    } else if (year || month) {
      // Only apply year/month filter if specifically requested
      if (month) {
        // Month filter takes precedence over year-only filter
        const currentYear = year || new Date().getFullYear();
        const startDate = new Date(currentYear, parseInt(month) - 1, 1);
        const endDate = new Date(currentYear, parseInt(month), 0);
        endDate.setHours(23, 59, 59, 999);
        
        dateFilter.repair_job_taken_time = {
          $gte: startDate,
          $lte: endDate
        };
      } else if (year) {
        // Apply year filter if only year is specified
        dateFilter.repair_job_taken_time = {
          $gte: new Date(year, 0, 1),
          $lte: new Date(year, 11, 31, 23, 59, 59)
        };
      }
    }
    // If no filters are specified, dateFilter remains empty to get all data
    

    
    // Apply department filter if specified
    if (department) {
      dateFilter.department = department;
    }
    
    
    // Log the date filter for debugging
    console.log('Financials API - Date filter:', dateFilter);
    console.log('Financials API - Query parameters:', { dateFrom, dateTo, department, part, month, year });
    
    // Get jobs with parts_used populated
    // If part filter is specified, find jobs that have that specific part
    let jobsQuery = Job.find(dateFilter);
    
    if (part) {
      // Filter jobs that have the specific part in their parts_used array
      jobsQuery = Job.find({
        ...dateFilter,
        'parts_used.part': part
      });
    }
    
    const jobs = await jobsQuery
      .populate({
        path: 'parts_used.part',
        select: 'name cost_price selling_price category',
        populate: {
          path: 'category',
          select: 'name'
        }
      })
      .populate('department', 'name');
    
    console.log('Financials API - Number of jobs found:', jobs.length);
    
    // Calculate revenue from jobs (service charges + parts revenue)
    let jobRevenueByDepartment = {};
    let jobMonthlyRevenue = {};
    let jobPartsRevenue = {};
    
    jobs.forEach(job => {
      console.log('Processing job:', job._id, 'Service charges:', job.service_charges, 'Parts used:', job.parts_used?.length || 0);
      
      // Calculate parts revenue for this job
      let partsRevenue = 0;
      let partsUsed = job.parts_used || [];
      
      partsUsed.forEach(partUsed => {
        const partData = partUsed.part;
        if (partData) {
          // Use edited cost if available, otherwise use original cost
          const unitCost = partUsed.edited_cost !== undefined ? partUsed.edited_cost : (partData.cost_price || 0);
          const unitSellingPrice = partData.selling_price || 0;
          const quantity = partUsed.quantity || 0;
          
          // Calculate revenue per unit (selling price - cost price)
          const unitRevenue = unitSellingPrice - unitCost;
          const totalRevenue = unitRevenue * quantity;
          
          console.log('Part revenue calculation:', {
            partName: partData.name,
            unitCost,
            unitSellingPrice,
            quantity,
            unitRevenue,
            totalRevenue
          });
          
          partsRevenue += totalRevenue;
          
          // Track parts revenue by part name
          const partName = partData.name || 'Unknown';
          if (!jobPartsRevenue[partName]) {
            jobPartsRevenue[partName] = {
              name: partName,
              category: partData.category?.name || 'N/A',
              revenue: 0,
              count: 0
            };
          }
          jobPartsRevenue[partName].revenue += totalRevenue;
          jobPartsRevenue[partName].count += quantity;
        }
      });
      
      // Total revenue for this job = parts revenue + service charges
      const jobTotalRevenue = partsRevenue + (job.service_charges || 0);
      console.log('Job total revenue:', jobTotalRevenue);
      
      // Group by department
      const deptName = job.department?.name || 'General';
      if (!jobRevenueByDepartment[deptName]) {
        jobRevenueByDepartment[deptName] = 0;
      }
      jobRevenueByDepartment[deptName] += jobTotalRevenue;
      
      // Group by month
      const monthKey = new Date(job.repair_job_taken_time).toLocaleString('default', { month: 'short' });
      if (!jobMonthlyRevenue[monthKey]) {
        jobMonthlyRevenue[monthKey] = 0;
      }
      jobMonthlyRevenue[monthKey] += jobTotalRevenue;
    });
    
    console.log('Revenue calculations completed:', {
      jobRevenueByDepartment,
      jobMonthlyRevenue,
      jobPartsRevenue
    });
    
    // Convert to arrays for charting
    const revenueByDepartment = Object.entries(jobRevenueByDepartment).map(([dept, revenue]) => ({
      department: dept,
      revenue: revenue
    }));
    
    const monthlyRevenue = Object.entries(jobMonthlyRevenue).map(([month, revenue]) => ({
      month: month,
      revenue: revenue
    }));
    
    // Parts revenue analysis
    const partsRevenueAnalysis = Object.values(jobPartsRevenue);
    
    // Also get traditional transaction data for comparison
    // Use the same date filter for transactions if date range is provided
    let transactionDateFilter = {};
    if (dateFrom && dateTo) {
      transactionDateFilter = {
        date: {
          $gte: new Date(dateFrom),
          $lte: new Date(dateTo)
        }
      };
    } else if (dateFrom) {
      transactionDateFilter = {
        date: { $gte: new Date(dateFrom) }
      };
    } else if (dateTo) {
      transactionDateFilter = {
        date: { $lte: new Date(dateTo) }
      };
    } else if (year || month) {
      // Apply year/month filter if specifically requested
      if (month) {
        const currentYear = year || new Date().getFullYear();
        const startDate = new Date(currentYear, parseInt(month) - 1, 1);
        const endDate = new Date(currentYear, parseInt(month), 0);
        endDate.setHours(23, 59, 59, 999);
        
        transactionDateFilter = {
          date: {
            $gte: startDate,
            $lte: endDate
          }
        };
      } else if (year) {
        // Apply year filter if only year is specified
        transactionDateFilter = {
          date: {
            $gte: new Date(year, 0, 1),
            $lte: new Date(year, 11, 31, 23, 59, 59)
          }
        };
      }
    }
    
    // Transaction-based revenue by department
    const transactionMatchCondition = {
      type: 'Income'
    };
    if (transactionDateFilter.date) {
      transactionMatchCondition.date = transactionDateFilter.date;
    }
    
    const transactionRevenueByDepartment = await Transaction.aggregate([
      {
        $match: transactionMatchCondition
      },
      {
        $group: {
          _id: '$department',
          totalRevenue: { $sum: '$amount' }
        }
      },
      {
        $project: {
          _id: 0,
          department: '$_id',
          revenue: '$totalRevenue'
        }
      }
    ]);

    // Transaction-based monthly revenue
    const transactionMonthlyRevenue = await Transaction.aggregate([
      {
        $match: transactionMatchCondition
      },
      {
        $group: {
          _id: { $month: '$date' },
          totalRevenue: { $sum: '$amount' }
        }
      },
      {
        $sort: { _id: 1 }
      },
      {
        $project: {
          _id: 0,
          month: {
            $switch: {
              branches: [
                { case: { $eq: ['$_id', 1] }, then: 'Jan' },
                { case: { $eq: ['$_id', 2] }, then: 'Feb' },
                { case: { $eq: ['$_id', 3] }, then: 'Mar' },
                { case: { $eq: ['$_id', 4] }, then: 'Apr' },
                { case: { $eq: ['$_id', 5] }, then: 'May' },
                { case: { $eq: ['$_id', 6] }, then: 'Jun' },
                { case: { $eq: ['$_id', 7] }, then: 'Jul' },
                { case: { $eq: ['$_id', 8] }, then: 'Aug' },
                { case: { $eq: ['$_id', 9] }, then: 'Sep' },
                { case: { $eq: ['$_id', 10] }, then: 'Oct' },
                { case: { $eq: ['$_id', 11] }, then: 'Nov' },
                { case: { $eq: ['$_id', 12] }, then: 'Dec' }
              ],
              default: 'Unknown'
            }
          },
          revenue: '$totalRevenue'
        }
      }
    ]);

    // Parts cost analysis
    const partsCostAnalysis = await Part.find({
      $or: [
        { cost_price: { $exists: true, $ne: null } },
        { selling_price: { $exists: true, $ne: null } }
      ]
    }).populate('category');

    // Calculate profit margin for each part
    const partsWithProfit = partsCostAnalysis.map(part => {
      const cost = part.cost_price || 0;
      const selling = part.selling_price || 0;
      const profitMargin = cost > 0 ? ((selling - cost) / cost * 100).toFixed(2) : 0;
      
      return {
        _id: part._id,
        name: part.name,
        category: part.category?.name || 'N/A',
        stock: part.stock,
        cost_price: cost,
        selling_price: selling,
        profit_margin: parseFloat(profitMargin)
      };
    });
    
    // Calculate total jobs revenue consistently with the same logic used in the main loop
    const totalJobsRevenue = jobs.reduce((sum, job) => {
      // Calculate revenue from parts + service charges
      let partsRevenue = 0;
      (job.parts_used || []).forEach(partUsed => {
        const partData = partUsed.part;
        if (partData) {
          const unitCost = partUsed.edited_cost !== undefined ? partUsed.edited_cost : (partData.cost_price || 0);
          const unitSellingPrice = partData.selling_price || 0;
          const quantity = partUsed.quantity || 0;
          const unitRevenue = unitSellingPrice - unitCost;
          partsRevenue += unitRevenue * quantity;
        }
      });
      return sum + partsRevenue + (job.service_charges || 0);
    }, 0);
    
    // Calculate total service charges separately - use the same filtering approach as service charges details API
    // Build the base date filter without the 'part' filter that affects the main jobs query
    let baseDateFilter = {};
    
    // Apply date range filter if both dates are provided
    if (dateFrom && dateTo) {
      baseDateFilter.repair_job_taken_time = {
        $gte: new Date(dateFrom),
        $lte: new Date(dateTo)
      };
    } else if (dateFrom) {
      // Apply from date only
      baseDateFilter.repair_job_taken_time = {
        $gte: new Date(dateFrom)
      };
    } else if (dateTo) {
      // Apply to date only
      baseDateFilter.repair_job_taken_time = {
        $lte: new Date(dateTo)
      };
    } else if (year || month) {
      // Only apply year/month filter if specifically requested
      if (month) {
        // Month filter takes precedence over year-only filter
        const currentYear = year || new Date().getFullYear();
        const startDate = new Date(currentYear, parseInt(month) - 1, 1);
        const endDate = new Date(currentYear, parseInt(month), 0);
        endDate.setHours(23, 59, 59, 999);
        
        baseDateFilter.repair_job_taken_time = {
          $gte: startDate,
          $lte: endDate
        };
      } else if (year) {
        // Apply year filter if only year is specified
        baseDateFilter.repair_job_taken_time = {
          $gte: new Date(year, 0, 1),
          $lte: new Date(year, 11, 31, 23, 59, 59)
        };
      }
    }
    
    // Apply department filter if specified (same as service charges details API)
    if (department) {
      baseDateFilter.department = department;
    }
    
    // Apply the same service charges filter as used in service charges details API
    const serviceChargeFilter = {
      ...baseDateFilter,
      service_charges: { $exists: true, $ne: null, $ne: '', $gt: 0 }
    };
    
    console.log('Financials API - Getting service charge jobs with filter:', serviceChargeFilter);
    
    // First, let's get ALL jobs to see what's in the database
    const allJobsCount = await Job.countDocuments();
    console.log('Financials API - Total jobs in database:', allJobsCount);
    
    // Get jobs with service_charges field
    const jobsWithServiceCharges = await Job.find({ service_charges: { $exists: true } });
    console.log('Financials API - Jobs with service_charges field:', jobsWithServiceCharges.length);
    
    // Check some of these jobs
    jobsWithServiceCharges.slice(0, 5).forEach((job, index) => {
      console.log(`Sample Job ${index + 1}: ID=${job._id}, service_charges=${job.service_charges}, type=${typeof job.service_charges}`);
    });
    
    // Now get jobs with our specific filter
    const serviceChargeJobs = await Job.find(serviceChargeFilter);
    console.log('Financials API - Found', serviceChargeJobs.length, 'jobs with service charges after applying date filter');
    
    // Debug each job's service charge value
    serviceChargeJobs.forEach((job, index) => {
      console.log(`Job ${index + 1}: ID=${job._id}, service_charges=${job.service_charges}, type=${typeof job.service_charges}`);
    });
    
    // Filter for jobs with positive service charges and calculate total
    const validServiceChargeJobs = serviceChargeJobs.filter(job => {
      const serviceChargeValue = parseFloat(job.service_charges) || 0;
      console.log(`Job ${job._id} - Raw value: ${job.service_charges}, Parsed: ${serviceChargeValue}, Positive: ${serviceChargeValue > 0}`);
      return serviceChargeValue > 0;
    });
    
    console.log('Financials API - Found', validServiceChargeJobs.length, 'jobs with positive service charges');
    
    const totalServiceCharges = validServiceChargeJobs.reduce((sum, job) => {
      const serviceChargeValue = parseFloat(job.service_charges) || 0;
      console.log(`Adding to total: ${serviceChargeValue}, Running total: ${sum + serviceChargeValue}`);
      return sum + serviceChargeValue;
    }, 0);
    
    console.log('Financials API - Final calculated total:', totalServiceCharges);
    
    // Round to 2 decimal places to handle floating point precision
    const roundedTotalServiceCharges = Number(totalServiceCharges.toFixed(2));
    console.log('Financials API - Total service charges calculated:', roundedTotalServiceCharges);
    
    // Combine job-based and transaction-based data
    const responseData = {
      revenue_by_department: revenueByDepartment,
      monthly_revenue: monthlyRevenue,
      parts_cost_analysis: partsWithProfit,
      parts_revenue_analysis: partsRevenueAnalysis,
      transaction_revenue_by_department: transactionRevenueByDepartment,
      transaction_monthly_revenue: transactionMonthlyRevenue,
      total_jobs_revenue: totalJobsRevenue,
      total_service_charges: roundedTotalServiceCharges
    };
    
    console.log('Financials API - Returning response data:', {
      revenue_by_department_count: responseData.revenue_by_department.length,
      monthly_revenue_count: responseData.monthly_revenue.length,
      parts_cost_analysis_count: responseData.parts_cost_analysis.length,
      parts_revenue_analysis_count: responseData.parts_revenue_analysis.length,
      total_jobs_revenue: responseData.total_jobs_revenue,
      total_service_charges: responseData.total_service_charges
    });
    
    res.json(responseData);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// GET /api/dashboard/service-charges-details
exports.getServiceChargeDetails = async (req, res) => {
  try {
    // Get query parameters for filtering
    const { dateFrom, dateTo, department, part, serviceCharge, month, year } = req.query;
    
    // Build date filter
    let dateFilter = {};
    
    // Apply date range filter if both dates are provided
    if (dateFrom && dateTo) {
      dateFilter.repair_job_taken_time = {
        $gte: new Date(dateFrom),
        $lte: new Date(dateTo)
      };
    } else if (dateFrom) {
      // Apply from date only
      dateFilter.repair_job_taken_time = {
        $gte: new Date(dateFrom)
      };
    } else if (dateTo) {
      // Apply to date only
      dateFilter.repair_job_taken_time = {
        $lte: new Date(dateTo)
      };
    } else if (year || month) {
      // Only apply year/month filter if specifically requested
      if (month) {
        // Month filter takes precedence over year-only filter
        const currentYear = year || new Date().getFullYear();
        const startDate = new Date(currentYear, parseInt(month) - 1, 1);
        const endDate = new Date(currentYear, parseInt(month), 0);
        endDate.setHours(23, 59, 59, 999);
        
        dateFilter.repair_job_taken_time = {
          $gte: startDate,
          $lte: endDate
        };
      } else if (year) {
        // Apply year filter if only year is specified
        dateFilter.repair_job_taken_time = {
          $gte: new Date(year, 0, 1),
          $lte: new Date(year, 11, 31, 23, 59, 59)
        };
      }
    }
    // If no filters are specified, dateFilter remains empty to get all data
    
    // Apply department filter if specified
    if (department) {
      dateFilter.department = department;
    }
    
    console.log('Service Charge Details API - Date filter:', dateFilter);
    console.log('Service Charge Details API - Query parameters:', { dateFrom, dateTo, department, part, month, year });
    
    // Get jobs with service charges, populated with customer info
    console.log('Service Charges Details API - Getting jobs with filter:', {
      ...dateFilter,
      service_charges: { $exists: true, $ne: null, $ne: '', $gt: 0 }
    });
    const jobs = await Job.find({
      ...dateFilter,
      service_charges: { $exists: true, $ne: null, $ne: '', $gt: 0 }  // Only jobs with service charges
    })
      .populate('customer', 'name')
      .populate('department', 'name')
      .populate('taken_by_worker', 'name');
    
    console.log('Service Charges Details API - Found', jobs.length, 'jobs with service charges');
    
    // Debug each job's service charge value in details API
    jobs.forEach((job, index) => {
      const serviceChargeValue = parseFloat(job.service_charges) || 0;
      console.log(`Details API - Job ${index + 1}: ID=${job._id}, service_charges=${job.service_charges}, type=${typeof job.service_charges}, parsed=${serviceChargeValue}`);
    });
    
    console.log('Service Charge Details API - Number of jobs with service charges found:', jobs.length);
    
    // Format the service charge details
    const serviceChargeDetails = jobs.map(job => {
      return {
        jobId: job._id,
        customerName: job.customer?.name || 'N/A',
        date: job.repair_job_taken_time,
        serviceChargeAmount: job.service_charges || 0,
        department: job.department?.name || 'General',
        worker: job.taken_by_worker?.name || 'N/A',
        status: job.status || 'N/A'
      };
    });
    
    // Filter for positive service charges and calculate total
    console.log('Service Charge Details API - Processing', serviceChargeDetails.length, 'details');
    
    const validServiceChargeDetails = serviceChargeDetails.filter(detail => {
      const serviceChargeValue = parseFloat(detail.serviceChargeAmount) || 0;
      console.log(`Details API - Detail ID=${detail.jobId}, raw amount=${detail.serviceChargeAmount}, parsed=${serviceChargeValue}, positive=${serviceChargeValue > 0}`);
      return serviceChargeValue > 0;
    });
    
    console.log('Service Charge Details API - Found', validServiceChargeDetails.length, 'valid details with positive amounts');
    
    const totalServiceCharge = validServiceChargeDetails.reduce((sum, detail) => {
      const serviceChargeValue = parseFloat(detail.serviceChargeAmount) || 0;
      console.log(`Details API - Adding ${serviceChargeValue} to total, running total: ${sum + serviceChargeValue}`);
      return sum + serviceChargeValue;
    }, 0);
    
    console.log('Service Charge Details API - Final total:', totalServiceCharge);
    
    res.json({
      details: serviceChargeDetails,
      totalServiceCharge: totalServiceCharge,
      count: serviceChargeDetails.length
    });
  } catch (err) {
    console.error('Error in getServiceChargeDetails:', err);
    res.status(500).json({ error: err.message });
  }
};

// GET /api/dashboard/parts-revenue-details
exports.getPartsRevenueDetails = async (req, res) => {
  try {
    // Get query parameters for filtering
    const { dateFrom, dateTo, department, part, month, year } = req.query;
    
    // Build date filter
    let dateFilter = {};
    
    // Apply date range filter if both dates are provided
    if (dateFrom && dateTo) {
      dateFilter.repair_job_taken_time = {
        $gte: new Date(dateFrom),
        $lte: new Date(dateTo)
      };
    } else if (dateFrom) {
      // Apply from date only
      dateFilter.repair_job_taken_time = {
        $gte: new Date(dateFrom)
      };
    } else if (dateTo) {
      // Apply to date only
      dateFilter.repair_job_taken_time = {
        $lte: new Date(dateTo)
      };
    } else if (year || month) {
      // Only apply year/month filter if specifically requested
      if (month) {
        // Month filter takes precedence over year-only filter
        const currentYear = year || new Date().getFullYear();
        const startDate = new Date(currentYear, parseInt(month) - 1, 1);
        const endDate = new Date(currentYear, parseInt(month), 0);
        endDate.setHours(23, 59, 59, 999);
        
        dateFilter.repair_job_taken_time = {
          $gte: startDate,
          $lte: endDate
        };
      } else if (year) {
        // Apply year filter if only year is specified
        dateFilter.repair_job_taken_time = {
          $gte: new Date(year, 0, 1),
          $lte: new Date(year, 11, 31, 23, 59, 59)
        };
      }
    }
    // If no filters are specified, dateFilter remains empty to get all data
    
    // Apply department filter if specified
    if (department) {
      dateFilter.department = department;
    }
    
    // Apply part filter if specified
    if (part) {
      // Filter jobs that have the specific part in their parts_used array
      dateFilter['parts_used.part'] = part;
    }
    
    console.log('Parts Revenue Details API - Date filter:', dateFilter);
    console.log('Parts Revenue Details API - Query parameters:', { dateFrom, dateTo, department, part, month, year });
    
    // Get jobs with parts_used populated
    const jobs = await Job.find(dateFilter)
      .populate({
        path: 'parts_used.part',
        select: 'name cost_price selling_price category',
        populate: {
          path: 'category',
          select: 'name'
        }
      })
      .populate('customer', 'name')
      .populate('department', 'name');
    
    console.log('Parts Revenue Details API - Number of jobs found:', jobs.length);
    
    // Calculate parts revenue details for each job
    let partsRevenueDetails = [];
    
    jobs.forEach(job => {
      console.log('Processing job for parts revenue details:', job._id, 'Parts used:', job.parts_used?.length || 0);
      
      // Process each part used in this job
      (job.parts_used || []).forEach(partUsed => {
        const partData = partUsed.part;
        if (partData) {
          // Use edited cost if available, otherwise use original cost
          const unitCost = partUsed.edited_cost !== undefined ? partUsed.edited_cost : (partData.cost_price || 0);
          const unitSellingPrice = partData.selling_price || 0;
          const quantity = partUsed.quantity || 0;
          
          // Calculate revenue per unit (selling price - cost price)
          const unitRevenue = unitSellingPrice - unitCost;
          const totalRevenue = unitRevenue * quantity;
          const totalCost = unitCost * quantity;
          const totalSellingPrice = unitSellingPrice * quantity;
          
          partsRevenueDetails.push({
            jobId: job._id,
            customerName: job.customer?.name || 'N/A',
            partName: partData.name,
            partCategory: partData.category?.name || 'N/A',
            date: job.repair_job_taken_time,
            department: job.department?.name || 'General',
            quantity: quantity,
            unitCost: unitCost,
            unitSellingPrice: unitSellingPrice,
            totalCost: totalCost,
            totalSellingPrice: totalSellingPrice,
            totalRevenue: totalRevenue,  // Profit
            status: job.status || 'N/A'
          });
        }
      });
    });
    
    // Calculate total parts revenue
    const totalPartsRevenue = partsRevenueDetails.reduce((sum, detail) => sum + detail.totalRevenue, 0);
    const totalPartsSold = partsRevenueDetails.reduce((sum, detail) => sum + detail.quantity, 0);
    
    console.log('Parts Revenue Details API - Calculated totals:', {
      totalPartsRevenue,
      totalPartsSold,
      detailsCount: partsRevenueDetails.length
    });
    
    res.json({
      details: partsRevenueDetails,
      totalPartsRevenue: totalPartsRevenue,
      totalPartsSold: totalPartsSold,
      count: partsRevenueDetails.length
    });
  } catch (err) {
    console.error('Error in getPartsRevenueDetails:', err);
    res.status(500).json({ error: err.message });
  }
};