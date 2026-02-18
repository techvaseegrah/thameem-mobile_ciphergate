import React, { useState, useEffect, useMemo } from 'react';
import api from '../services/api';
import { useNavigate } from 'react-router-dom';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';

const ProductSales = () => {
    const [products, setProducts] = useState([]);
    const [cart, setCart] = useState([]);
    const [sales, setSales] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [searchTerm, setSearchTerm] = useState('');
    const [showHistory, setShowHistory] = useState(false);
    const navigate = useNavigate();

    // Sales history search & filter state
    const [historySearch, setHistorySearch] = useState('');
    const [dateFilter, setDateFilter] = useState('all'); // all, today, this_week, this_month, custom
    const [dateFrom, setDateFrom] = useState('');
    const [dateTo, setDateTo] = useState('');
    const [showMobileCart, setShowMobileCart] = useState(false);

    // Customer and payment info
    const [customerName, setCustomerName] = useState('');
    const [customerPhone, setCustomerPhone] = useState('');
    const [discount, setDiscount] = useState('');
    const [paymentMethod, setPaymentMethod] = useState('cash');

    // Check authentication
    useEffect(() => {
        const storedAdmin = localStorage.getItem('admin');
        if (!storedAdmin) {
            navigate('/admin/login');
        }
    }, [navigate]);

    // Fetch products from inventory
    const fetchProducts = async () => {
        try {
            const res = await api.get('/inventory');
            setProducts(res.data);
            setLoading(false);
        } catch (err) {
            console.error(err);
            setError('Failed to fetch products');
            setLoading(false);
        }
    };

    // Fetch sales history
    const fetchSales = async () => {
        try {
            const res = await api.get('/sales');
            setSales(res.data.sales || []);
        } catch (err) {
            console.error(err);
            setError('Failed to fetch sales history');
        }
    };

    useEffect(() => {
        fetchProducts();
        fetchSales();
    }, []);

    // Filter products based on search
    const filteredProducts = products.filter(product => {
        const searchLower = searchTerm.toLowerCase();
        return (
            product.name.toLowerCase().includes(searchLower) ||
            product.sku.toLowerCase().includes(searchLower) ||
            (product.category?.name && product.category.name.toLowerCase().includes(searchLower))
        );
    });

    // Add product to cart
    const addToCart = (product) => {
        const existingItem = cart.find(item => item.product._id === product._id);

        if (existingItem) {
            // Increase quantity if already in cart
            if (existingItem.quantity < product.stock) {
                setCart(cart.map(item =>
                    item.product._id === product._id
                        ? { ...item, quantity: item.quantity + 1 }
                        : item
                ));
            } else {
                setError(`Cannot add more. Only ${product.stock} units available.`);
                setTimeout(() => setError(''), 3000);
            }
        } else {
            // Add new item to cart
            if (product.stock > 0) {
                setCart([...cart, { product, quantity: 1 }]);
            } else {
                setError('Product is out of stock');
                setTimeout(() => setError(''), 3000);
            }
        }
    };

    // Update cart item quantity
    const updateQuantity = (productId, newQuantity) => {
        const product = products.find(p => p._id === productId);

        if (newQuantity <= 0) {
            removeFromCart(productId);
            return;
        }

        if (newQuantity > product.stock) {
            setError(`Only ${product.stock} units available`);
            setTimeout(() => setError(''), 3000);
            return;
        }

        setCart(cart.map(item =>
            item.product._id === productId
                ? { ...item, quantity: newQuantity }
                : item
        ));
    };

    // Remove item from cart
    const removeFromCart = (productId) => {
        setCart(cart.filter(item => item.product._id !== productId));
    };

    // Clear cart
    const clearCart = () => {
        setCart([]);
        setCustomerName('');
        setCustomerPhone('');
        setDiscount('');
        setPaymentMethod('cash');
    };

    // Calculate total
    // Calculate subtotal (before discount)
    const calculateSubtotal = () => {
        return cart.reduce((total, item) => {
            return total + (item.product.selling_price || 0) * item.quantity;
        }, 0);
    };

    // Calculate total (after discount)
    const calculateTotal = () => {
        const subtotal = calculateSubtotal();
        const discountAmount = Math.max(0, Math.min(Number(discount) || 0, subtotal));
        return subtotal - discountAmount;
    };

    // Complete sale
    const completeSale = async () => {
        if (cart.length === 0) {
            setError('Cart is empty. Add products to make a sale.');
            return;
        }

        try {
            const saleData = {
                products: cart.map(item => ({
                    product: item.product._id,
                    quantity: item.quantity
                })),
                customer: {
                    name: customerName.trim(),
                    phone: customerPhone.trim()
                },
                discount: Number(discount) || 0,
                paymentMethod
            };

            const res = await api.post('/sales', saleData);

            setSuccess(`Sale completed! Sale Number: ${res.data.saleNumber}`);

            // Clear cart and form
            clearCart();

            // Refresh products and sales
            fetchProducts();
            fetchSales();

            // Clear success message after 5 seconds
            setTimeout(() => setSuccess(''), 5000);
        } catch (err) {
            console.error(err);
            setError(err.response?.data?.error || 'Failed to complete sale');
            setTimeout(() => setError(''), 5000);
        }
    };

    // Filter sales for history view
    const filteredSales = useMemo(() => {
        let result = [...sales];

        // Text search filter
        if (historySearch.trim()) {
            const search = historySearch.toLowerCase();
            result = result.filter(sale =>
                sale.saleNumber?.toLowerCase().includes(search) ||
                sale.customer?.name?.toLowerCase().includes(search) ||
                sale.customer?.phone?.toLowerCase().includes(search)
            );
        }

        // Date filter
        const now = new Date();
        const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());

        if (dateFilter === 'today') {
            result = result.filter(sale => new Date(sale.createdAt) >= startOfToday);
        } else if (dateFilter === 'this_week') {
            const startOfWeek = new Date(startOfToday);
            startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay());
            result = result.filter(sale => new Date(sale.createdAt) >= startOfWeek);
        } else if (dateFilter === 'this_month') {
            const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
            result = result.filter(sale => new Date(sale.createdAt) >= startOfMonth);
        } else if (dateFilter === 'custom') {
            if (dateFrom) {
                const from = new Date(dateFrom);
                result = result.filter(sale => new Date(sale.createdAt) >= from);
            }
            if (dateTo) {
                const to = new Date(dateTo);
                to.setHours(23, 59, 59, 999);
                result = result.filter(sale => new Date(sale.createdAt) <= to);
            }
        }

        return result;
    }, [sales, historySearch, dateFilter, dateFrom, dateTo]);

    // Export to PDF
    const exportToPDF = (salesData) => {
        const doc = new jsPDF();

        // Title
        doc.setFontSize(18);
        doc.text('Sales Report', 14, 22);

        // Date info
        doc.setFontSize(10);
        doc.setTextColor(100);
        const dateLabel = dateFilter === 'today' ? 'Today'
            : dateFilter === 'this_week' ? 'This Week'
                : dateFilter === 'this_month' ? 'This Month'
                    : dateFilter === 'custom' ? `${dateFrom || '...'} to ${dateTo || '...'}`
                        : 'All Time';
        doc.text(`Period: ${dateLabel}  |  Generated: ${new Date().toLocaleString()}`, 14, 30);

        // Table
        const tableData = salesData.map(sale => [
            sale.saleNumber,
            new Date(sale.createdAt).toLocaleDateString(),
            sale.customer?.name || 'Walk-in',
            sale.customer?.phone || '-',
            sale.products.length + ' item(s)',
            (sale.discount || 0) > 0 ? `Rs ${sale.discount.toFixed(2)}` : '-',
            `Rs ${sale.totalAmount.toFixed(2)}`,
            sale.paymentMethod.toUpperCase()
        ]);

        // Add totals row
        const totalDiscount = salesData.reduce((sum, s) => sum + (s.discount || 0), 0);
        const totalAmount = salesData.reduce((sum, s) => sum + s.totalAmount, 0);
        tableData.push([
            '', '', '', '', 'TOTAL',
            totalDiscount > 0 ? `Rs ${totalDiscount.toFixed(2)}` : '-',
            `Rs ${totalAmount.toFixed(2)}`,
            ''
        ]);

        autoTable(doc, {
            head: [['Sale #', 'Date', 'Customer', 'Phone', 'Products', 'Discount', 'Total', 'Payment']],
            body: tableData,
            startY: 36,
            styles: { fontSize: 8 },
            headStyles: { fillColor: [59, 130, 246] },
            footStyles: { fillColor: [243, 244, 246], textColor: [0, 0, 0], fontStyle: 'bold' },
            didParseCell: function (data) {
                // Bold the last row (totals)
                if (data.row.index === tableData.length - 1) {
                    data.cell.styles.fontStyle = 'bold';
                    data.cell.styles.fillColor = [243, 244, 246];
                }
            }
        });

        doc.save(`sales-report-${new Date().toISOString().slice(0, 10)}.pdf`);
    };

    // Export to Excel
    const exportToExcel = (salesData) => {
        const wsData = salesData.map(sale => ({
            'Sale #': sale.saleNumber,
            'Date': new Date(sale.createdAt).toLocaleDateString(),
            'Customer': sale.customer?.name || 'Walk-in',
            'Phone': sale.customer?.phone || '-',
            'Products': sale.products.length + ' item(s)',
            'Discount (Rs)': (sale.discount || 0).toFixed(2),
            'Total (Rs)': sale.totalAmount.toFixed(2),
            'Payment': sale.paymentMethod.toUpperCase()
        }));

        // Add totals row
        const totalDiscount = salesData.reduce((sum, s) => sum + (s.discount || 0), 0);
        const totalAmount = salesData.reduce((sum, s) => sum + s.totalAmount, 0);
        wsData.push({
            'Sale #': '',
            'Date': '',
            'Customer': '',
            'Phone': '',
            'Products': 'TOTAL',
            'Discount (Rs)': totalDiscount.toFixed(2),
            'Total (Rs)': totalAmount.toFixed(2),
            'Payment': ''
        });

        const ws = XLSX.utils.json_to_sheet(wsData);

        // Set column widths
        ws['!cols'] = [
            { wch: 22 }, { wch: 12 }, { wch: 18 }, { wch: 15 },
            { wch: 12 }, { wch: 14 }, { wch: 14 }, { wch: 14 }
        ];

        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Sales');
        const excelBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
        const data = new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        saveAs(data, `sales-report-${new Date().toISOString().slice(0, 10)}.xlsx`);
    };

    if (loading) {
        return (
            <div className="p-4 md:p-8 bg-gray-100 min-h-screen flex items-center justify-center">
                <div className="text-xl">Loading products...</div>
            </div>
        );
    }

    return (
        <div className="p-4 md:p-8 bg-gray-100 min-h-screen pb-20 md:pb-8">
            <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center mb-8 gap-4">
                <div>
                    <h1 className="text-2xl md:text-3xl font-bold text-gray-900">Product Sales</h1>
                    <p className="text-gray-600">Sell products directly from inventory</p>
                </div>
                <button
                    onClick={() => setShowHistory(!showHistory)}
                    className="bg-indigo-600 text-white px-4 py-2 rounded-lg font-semibold hover:bg-indigo-700 transition"
                >
                    {showHistory ? 'Hide History' : 'View Sales History'}
                </button>
            </div>

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

            {showHistory ? (
                // Sales History View
                <div className="bg-white rounded-lg shadow overflow-hidden">
                    <div className="border-b border-gray-200 p-4 sm:p-6">
                        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-4">
                            <h2 className="text-xl font-semibold text-gray-800">Sales History</h2>
                            <div className="flex gap-2">
                                <button
                                    onClick={() => exportToPDF(filteredSales)}
                                    className="flex items-center gap-1 px-3 py-1.5 bg-red-600 text-white text-sm rounded-lg hover:bg-red-700 transition font-medium"
                                >
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                                    PDF
                                </button>
                                <button
                                    onClick={() => exportToExcel(filteredSales)}
                                    className="flex items-center gap-1 px-3 py-1.5 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700 transition font-medium"
                                >
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                                    Excel
                                </button>
                            </div>
                        </div>

                        {/* Search bar */}
                        <input
                            type="text"
                            placeholder="Search by sale number, customer name, or phone..."
                            value={historySearch}
                            onChange={(e) => setHistorySearch(e.target.value)}
                            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-sm mb-3"
                        />

                        {/* Date filter buttons */}
                        <div className="flex flex-wrap gap-2 items-center">
                            {[
                                { key: 'all', label: 'All' },
                                { key: 'today', label: 'Today' },
                                { key: 'this_week', label: 'This Week' },
                                { key: 'this_month', label: 'This Month' },
                                { key: 'custom', label: 'Custom Range' }
                            ].map(filter => (
                                <button
                                    key={filter.key}
                                    onClick={() => setDateFilter(filter.key)}
                                    className={`px-3 py-1.5 text-sm rounded-lg font-medium transition ${dateFilter === filter.key
                                        ? 'bg-blue-600 text-white'
                                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                                        }`}
                                >
                                    {filter.label}
                                </button>
                            ))}
                        </div>

                        {/* Custom date range inputs */}
                        {dateFilter === 'custom' && (
                            <div className="flex flex-col sm:flex-row gap-3 mt-3">
                                <div className="flex-1">
                                    <label className="block text-xs font-medium text-gray-500 mb-1">From</label>
                                    <input
                                        type="date"
                                        value={dateFrom}
                                        onChange={(e) => setDateFrom(e.target.value)}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                                    />
                                </div>
                                <div className="flex-1">
                                    <label className="block text-xs font-medium text-gray-500 mb-1">To</label>
                                    <input
                                        type="date"
                                        value={dateTo}
                                        onChange={(e) => setDateTo(e.target.value)}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                                    />
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Results count */}
                    <div className="px-4 sm:px-6 py-2 bg-gray-50 border-b border-gray-200 text-sm text-gray-600">
                        Showing {filteredSales.length} of {sales.length} sales
                    </div>

                    <div className="overflow-x-auto">
                        {filteredSales.length === 0 ? (
                            <div className="p-8 text-center text-gray-500">
                                {sales.length === 0 ? 'No sales recorded yet.' : 'No sales match your search/filter.'}
                            </div>
                        ) : (
                            <table className="w-full divide-y divide-gray-200">
                                <thead className="bg-gray-50">
                                    <tr>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Sale #</th>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Customer</th>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Products</th>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Discount</th>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Total</th>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Payment</th>
                                    </tr>
                                </thead>
                                <tbody className="bg-white divide-y divide-gray-200">
                                    {filteredSales.map((sale) => (
                                        <tr key={sale._id}>
                                            <td className="px-4 py-3 text-sm font-medium text-gray-900">
                                                {sale.saleNumber}
                                            </td>
                                            <td className="px-4 py-3 text-sm text-gray-500">
                                                {new Date(sale.createdAt).toLocaleDateString()}
                                            </td>
                                            <td className="px-4 py-3 text-sm text-gray-500">
                                                {sale.customer?.name || 'Walk-in'}
                                                {sale.customer?.phone && <div className="text-xs">{sale.customer.phone}</div>}
                                            </td>
                                            <td className="px-4 py-3 text-sm text-gray-500">
                                                {sale.products.length} item(s)
                                            </td>
                                            <td className="px-4 py-3 text-sm text-green-600">
                                                {(sale.discount || 0) > 0 ? `Rs ${sale.discount.toFixed(2)}` : '-'}
                                            </td>
                                            <td className="px-4 py-3 text-sm font-semibold text-gray-900">
                                                Rs {sale.totalAmount.toFixed(2)}
                                            </td>
                                            <td className="px-4 py-3 text-sm text-gray-500">
                                                <span className="px-2 py-1 text-xs rounded-full bg-blue-100 text-blue-800">
                                                    {sale.paymentMethod.toUpperCase()}
                                                </span>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                    </div>
                </div>
            ) : (
                // Sales Interface
                <>
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                        {/* Product Selection */}
                        <div className="lg:col-span-2 bg-white rounded-lg shadow overflow-hidden">
                            <div className="border-b border-gray-200 p-3 sm:p-6">
                                <h2 className="text-lg sm:text-xl font-semibold text-gray-800 mb-3">Select Products</h2>
                                <input
                                    type="text"
                                    placeholder="Search products..."
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-sm"
                                />
                            </div>
                            <div className="p-2 sm:p-4 max-h-[calc(100vh-280px)] overflow-y-auto">
                                {filteredProducts.length === 0 ? (
                                    <div className="text-center text-gray-500 py-8">
                                        {searchTerm ? 'No products match your search.' : 'No products available.'}
                                    </div>
                                ) : (
                                    <>
                                        {/* Mobile: Compact list view */}
                                        <div className="sm:hidden space-y-2">
                                            {filteredProducts.map((product) => {
                                                const inCart = cart.find(item => item.product._id === product._id);
                                                return (
                                                    <div
                                                        key={product._id}
                                                        className={`flex items-center gap-2 p-2 border rounded-lg ${product.stock === 0 ? 'bg-gray-50 opacity-60' : 'bg-white'}`}
                                                    >
                                                        <div className="flex-1 min-w-0">
                                                            <div className="font-medium text-sm text-gray-900 truncate">{product.name}</div>
                                                            <div className="flex items-center gap-2 mt-0.5">
                                                                <span className="font-bold text-sm text-blue-600">Rs {product.selling_price?.toFixed(2) || '0.00'}</span>
                                                                <span className={`text-xs ${product.stock <= product.min_stock_alert ? 'text-red-600 font-semibold' : 'text-gray-400'}`}>
                                                                    Stock: {product.stock}
                                                                </span>
                                                                {inCart && (
                                                                    <span className="text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full font-medium">
                                                                        ×{inCart.quantity}
                                                                    </span>
                                                                )}
                                                            </div>
                                                        </div>
                                                        <button
                                                            onClick={() => addToCart(product)}
                                                            disabled={product.stock === 0}
                                                            className={`shrink-0 px-3 py-2 rounded-lg text-xs font-semibold transition ${product.stock === 0
                                                                ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                                                                : 'bg-blue-600 text-white hover:bg-blue-700 active:bg-blue-800'
                                                                }`}
                                                        >
                                                            {product.stock === 0 ? 'Out' : '+ Add'}
                                                        </button>
                                                    </div>
                                                );
                                            })}
                                        </div>

                                        {/* Desktop: Card grid view */}
                                        <div className="hidden sm:grid sm:grid-cols-2 gap-4">
                                            {filteredProducts.map((product) => (
                                                <div
                                                    key={product._id}
                                                    className={`border rounded-lg p-4 hover:shadow-md transition ${product.stock === 0 ? 'bg-gray-50 opacity-60' : 'bg-white'
                                                        }`}
                                                >
                                                    <div className="flex justify-between items-start mb-2">
                                                        <div className="flex-1">
                                                            <h3 className="font-semibold text-gray-900">{product.name}</h3>
                                                            <p className="text-xs text-gray-500">{product.sku}</p>
                                                            {product.category && (
                                                                <span className="inline-block mt-1 px-2 py-0.5 text-xs rounded-full bg-gray-100 text-gray-700">
                                                                    {product.category.name}
                                                                </span>
                                                            )}
                                                        </div>
                                                        <div className="text-right">
                                                            <div className="font-bold text-lg text-gray-900">
                                                                Rs {product.selling_price?.toFixed(2) || '0.00'}
                                                            </div>
                                                            <div className={`text-sm ${product.stock <= product.min_stock_alert ? 'text-red-600 font-semibold' : 'text-gray-500'}`}>
                                                                Stock: {product.stock}
                                                            </div>
                                                        </div>
                                                    </div>
                                                    <button
                                                        onClick={() => addToCart(product)}
                                                        disabled={product.stock === 0}
                                                        className={`w-full mt-2 py-2 rounded-lg font-semibold transition ${product.stock === 0
                                                            ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                                                            : 'bg-blue-600 text-white hover:bg-blue-700'
                                                            }`}
                                                    >
                                                        {product.stock === 0 ? 'Out of Stock' : 'Add to Cart'}
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                    </>
                                )}
                            </div>
                        </div>

                        {/* Cart and Checkout - Desktop only */}
                        <div className="hidden lg:block lg:col-span-1">
                            <div className="bg-white rounded-lg shadow overflow-hidden sticky top-4">
                                <div className="border-b border-gray-200 p-4 bg-gray-50">
                                    <h2 className="text-xl font-semibold text-gray-800">Cart ({cart.length})</h2>
                                </div>
                                <div className="p-4 max-h-[400px] overflow-y-auto">
                                    {cart.length === 0 ? (
                                        <div className="text-center text-gray-500 py-8">
                                            Cart is empty
                                        </div>
                                    ) : (
                                        <div className="space-y-3">
                                            {cart.map((item) => (
                                                <div key={item.product._id} className="border rounded-lg p-3">
                                                    <div className="flex justify-between items-start mb-2">
                                                        <div className="flex-1">
                                                            <h4 className="font-semibold text-sm text-gray-900">{item.product.name}</h4>
                                                            <p className="text-xs text-gray-500">Rs {item.product.selling_price?.toFixed(2)}</p>
                                                        </div>
                                                        <button
                                                            onClick={() => removeFromCart(item.product._id)}
                                                            className="text-red-600 hover:text-red-800 text-xs"
                                                        >
                                                            Remove
                                                        </button>
                                                    </div>
                                                    <div className="flex items-center justify-between">
                                                        <div className="flex items-center space-x-2">
                                                            <button
                                                                onClick={() => updateQuantity(item.product._id, item.quantity - 1)}
                                                                className="w-6 h-6 bg-gray-200 rounded hover:bg-gray-300 text-sm"
                                                            >
                                                                -
                                                            </button>
                                                            <input
                                                                type="number"
                                                                value={item.quantity}
                                                                onChange={(e) => updateQuantity(item.product._id, parseInt(e.target.value) || 1)}
                                                                className="w-12 text-center border border-gray-300 rounded text-sm"
                                                                min="1"
                                                                max={item.product.stock}
                                                            />
                                                            <button
                                                                onClick={() => updateQuantity(item.product._id, item.quantity + 1)}
                                                                className="w-6 h-6 bg-gray-200 rounded hover:bg-gray-300 text-sm"
                                                            >
                                                                +
                                                            </button>
                                                        </div>
                                                        <div className="font-semibold text-gray-900">
                                                            Rs {((item.product.selling_price || 0) * item.quantity).toFixed(2)}
                                                        </div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>

                                {cart.length > 0 && (
                                    <>
                                        <div className="border-t border-gray-200 p-4 space-y-3">
                                            <div>
                                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                                    Customer Name (Optional)
                                                </label>
                                                <input
                                                    type="text"
                                                    value={customerName}
                                                    onChange={(e) => setCustomerName(e.target.value)}
                                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                                                    placeholder="Enter customer name"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                                    Phone Number (Optional)
                                                </label>
                                                <input
                                                    type="tel"
                                                    value={customerPhone}
                                                    onChange={(e) => setCustomerPhone(e.target.value)}
                                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                                                    placeholder="Enter phone number"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                                    Discount (Rs)
                                                </label>
                                                <input
                                                    type="number"
                                                    value={discount}
                                                    onChange={(e) => setDiscount(e.target.value)}
                                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                                                    placeholder="Enter discount amount"
                                                    min="0"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                                    Payment Method
                                                </label>
                                                <select
                                                    value={paymentMethod}
                                                    onChange={(e) => setPaymentMethod(e.target.value)}
                                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-white text-sm"
                                                >
                                                    <option value="cash">Cash</option>
                                                    <option value="card">Card</option>
                                                    <option value="upi">UPI</option>
                                                    <option value="bank_transfer">Bank Transfer</option>
                                                </select>
                                            </div>
                                        </div>

                                        <div className="border-t border-gray-200 p-4 bg-gray-50">
                                            <div className="flex justify-between items-center mb-1">
                                                <span className="text-sm text-gray-600">Subtotal:</span>
                                                <span className="text-sm text-gray-900">
                                                    Rs {calculateSubtotal().toFixed(2)}
                                                </span>
                                            </div>
                                            {Number(discount) > 0 && (
                                                <div className="flex justify-between items-center mb-1">
                                                    <span className="text-sm text-green-600">Discount:</span>
                                                    <span className="text-sm text-green-600">
                                                        - Rs {Math.min(Number(discount), calculateSubtotal()).toFixed(2)}
                                                    </span>
                                                </div>
                                            )}
                                            <div className="flex justify-between items-center mb-4 mt-2 pt-2 border-t border-gray-200">
                                                <span className="text-lg font-bold text-gray-900">Total:</span>
                                                <span className="text-2xl font-bold text-blue-600">
                                                    Rs {calculateTotal().toFixed(2)}
                                                </span>
                                            </div>
                                            <div className="space-y-2">
                                                <button
                                                    onClick={completeSale}
                                                    className="w-full bg-green-600 text-white py-3 rounded-lg font-semibold hover:bg-green-700 transition"
                                                >
                                                    Complete Sale
                                                </button>
                                                <button
                                                    onClick={clearCart}
                                                    className="w-full bg-gray-200 text-gray-700 py-2 rounded-lg font-semibold hover:bg-gray-300 transition"
                                                >
                                                    Clear Cart
                                                </button>
                                            </div>
                                        </div>
                                    </>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Mobile Cart - Bottom Sheet */}
                    {cart.length > 0 && (
                        <div className="lg:hidden fixed bottom-0 left-0 right-0 z-50">
                            {/* Backdrop */}
                            {showMobileCart && (
                                <div className="fixed inset-0 bg-black bg-opacity-50 z-40" onClick={() => setShowMobileCart(false)} />
                            )}
                            {/* Expandable sheet */}
                            <div className={`relative z-50 bg-white rounded-t-2xl shadow-2xl transition-all duration-300 ${showMobileCart ? 'max-h-[85vh]' : 'max-h-0'} overflow-hidden`}>
                                <div className="p-4 max-h-[85vh] overflow-y-auto pb-4">
                                    <div className="flex justify-between items-center mb-3">
                                        <h3 className="text-lg font-bold text-gray-900">Cart ({cart.length})</h3>
                                        <button onClick={() => setShowMobileCart(false)} className="text-gray-400 hover:text-gray-600">
                                            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                                        </button>
                                    </div>

                                    {/* Cart items */}
                                    <div className="space-y-2 mb-4">
                                        {cart.map((item) => (
                                            <div key={item.product._id} className="flex items-center gap-2 p-2 bg-gray-50 rounded-lg">
                                                <div className="flex-1 min-w-0">
                                                    <div className="font-medium text-sm text-gray-900 truncate">{item.product.name}</div>
                                                    <div className="text-xs text-gray-500">Rs {item.product.selling_price?.toFixed(2)} each</div>
                                                </div>
                                                <div className="flex items-center gap-1.5 shrink-0">
                                                    <button
                                                        onClick={() => updateQuantity(item.product._id, item.quantity - 1)}
                                                        className="w-7 h-7 bg-gray-200 rounded-full hover:bg-gray-300 text-sm flex items-center justify-center"
                                                    >-</button>
                                                    <span className="w-6 text-center text-sm font-medium">{item.quantity}</span>
                                                    <button
                                                        onClick={() => updateQuantity(item.product._id, item.quantity + 1)}
                                                        className="w-7 h-7 bg-gray-200 rounded-full hover:bg-gray-300 text-sm flex items-center justify-center"
                                                    >+</button>
                                                </div>
                                                <div className="text-sm font-semibold text-gray-900 w-20 text-right shrink-0">
                                                    Rs {((item.product.selling_price || 0) * item.quantity).toFixed(2)}
                                                </div>
                                                <button
                                                    onClick={() => removeFromCart(item.product._id)}
                                                    className="text-red-500 shrink-0 p-1"
                                                >
                                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                                </button>
                                            </div>
                                        ))}
                                    </div>

                                    {/* Customer & payment form */}
                                    <div className="space-y-3 mb-4">
                                        <div className="grid grid-cols-2 gap-2">
                                            <input
                                                type="text"
                                                value={customerName}
                                                onChange={(e) => setCustomerName(e.target.value)}
                                                className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                                                placeholder="Customer name"
                                            />
                                            <input
                                                type="tel"
                                                value={customerPhone}
                                                onChange={(e) => setCustomerPhone(e.target.value)}
                                                className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                                                placeholder="Phone number"
                                            />
                                        </div>
                                        <div className="grid grid-cols-2 gap-2">
                                            <input
                                                type="number"
                                                value={discount}
                                                onChange={(e) => setDiscount(e.target.value)}
                                                className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                                                placeholder="Discount (Rs)"
                                                min="0"
                                            />
                                            <select
                                                value={paymentMethod}
                                                onChange={(e) => setPaymentMethod(e.target.value)}
                                                className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-white text-sm"
                                            >
                                                <option value="cash">Cash</option>
                                                <option value="card">Card</option>
                                                <option value="upi">UPI</option>
                                                <option value="bank_transfer">Bank Transfer</option>
                                            </select>
                                        </div>
                                    </div>

                                    {/* Totals */}
                                    <div className="bg-gray-50 rounded-lg p-3 mb-3">
                                        <div className="flex justify-between text-sm text-gray-600 mb-1">
                                            <span>Subtotal</span>
                                            <span>Rs {calculateSubtotal().toFixed(2)}</span>
                                        </div>
                                        {Number(discount) > 0 && (
                                            <div className="flex justify-between text-sm text-green-600 mb-1">
                                                <span>Discount</span>
                                                <span>- Rs {Math.min(Number(discount), calculateSubtotal()).toFixed(2)}</span>
                                            </div>
                                        )}
                                        <div className="flex justify-between font-bold text-gray-900 pt-1 border-t border-gray-200 mt-1">
                                            <span>Total</span>
                                            <span className="text-blue-600 text-lg">Rs {calculateTotal().toFixed(2)}</span>
                                        </div>
                                    </div>

                                    {/* Action buttons */}
                                    <div className="flex gap-2">
                                        <button
                                            onClick={clearCart}
                                            className="flex-shrink-0 px-4 py-3 bg-gray-200 text-gray-700 rounded-lg font-semibold hover:bg-gray-300 transition text-sm"
                                        >
                                            Clear
                                        </button>
                                        <button
                                            onClick={completeSale}
                                            className="flex-1 bg-green-600 text-white py-3 rounded-lg font-semibold hover:bg-green-700 transition text-sm"
                                        >
                                            Complete Sale — Rs {calculateTotal().toFixed(2)}
                                        </button>
                                    </div>
                                </div>
                            </div>

                            {/* Sticky bottom bar */}
                            <div
                                onClick={() => setShowMobileCart(!showMobileCart)}
                                className="bg-blue-600 text-white px-4 py-3 flex justify-between items-center cursor-pointer active:bg-blue-700"
                            >
                                <div className="flex items-center gap-3">
                                    <div className="bg-white text-blue-600 w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm">
                                        {cart.reduce((sum, item) => sum + item.quantity, 0)}
                                    </div>
                                    <span className="font-medium text-sm">
                                        {showMobileCart ? 'Tap to close' : 'View Cart'}
                                    </span>
                                </div>
                                <span className="font-bold text-lg">Rs {calculateTotal().toFixed(2)}</span>
                            </div>
                        </div>
                    )}
                </>
            )}
        </div>
    );
};

export default ProductSales;
