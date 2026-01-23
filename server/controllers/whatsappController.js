const axios = require('axios');
const FormData = require('form-data');
const { Job, Customer } = require('../models/Schemas');

class WhatsAppController {

constructor() {
  // WhatsApp API credentials
  this.accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
  this.phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  this.businessAccountId = process.env.WHATSAPP_BUSINESS_ACCOUNT_ID;
  this.apiVersion = process.env.WHATSAPP_API_VERSION || 'v18.0';
  this.templateName = process.env.WHATSAPP_TEMPLATE_NAME || 'new_repair_job_intakee';
  
  console.log('WhatsApp Controller Initialized:');
  console.log('- Phone Number ID:', this.phoneNumberId ? 'Set' : 'Not Set');
  console.log('- Access Token:', this.accessToken ? 'Set (length: ' + this.accessToken.length + ')' : 'Not Set');
  console.log('- Template Name:', this.templateName);
  console.log('- API Version:', this.apiVersion);
  
  if (this.accessToken && this.phoneNumberId) {
    this.baseUrl = `https://graph.facebook.com/${this.apiVersion}/${this.phoneNumberId}/messages`;
    this.mediaUrl = `https://graph.facebook.com/${this.apiVersion}/${this.phoneNumberId}/media`;
    console.log('- Base URL:', this.baseUrl);
  }
  
  // ✅ ADD sendDeviceVideo HERE
  // Bind all methods
  this.formatPhoneNumber = this.formatPhoneNumber.bind(this);
  this.uploadMedia = this.uploadMedia.bind(this);
  this.sendTemplateWithDocument = this.sendTemplateWithDocument.bind(this);
  this.sendTextMessageInternal = this.sendTextMessageInternal.bind(this);
  this.sendJobIntakeWithMedia = this.sendJobIntakeWithMedia.bind(this);
  this.sendJobIntakeNotification = this.sendJobIntakeNotification.bind(this);
  this.testWhatsAppCredentials = this.testWhatsAppCredentials.bind(this);
  this.sendTextMessage = this.sendTextMessage.bind(this);
  this.sendShopVideoToCustomer = this.sendShopVideoToCustomer.bind(this);
  this.sendJobCompletionNotification = this.sendJobCompletionNotification.bind(this);
  this.getMessageStatus = this.getMessageStatus.bind(this);
  
  // ✅ ADD THIS LINE
  this.sendDeviceVideo = this.sendDeviceVideo.bind(this);
}

  // Helper: Format phone number for WhatsApp
  formatPhoneNumber(phone) {
    if (!phone) return null;
    
    // Ensure phone is string
    const phoneStr = phone.toString();
    
    // Remove all non-numeric characters
    let cleaned = phoneStr.replace(/\D/g, '');
    
    // If starts with 0, replace with 91 (India)
    if (cleaned.startsWith('0')) {
      cleaned = '91' + cleaned.substring(1);
    }
    
    // If doesn't start with country code and is 10 digits, add 91 (India)
    if (cleaned.length === 10 && !cleaned.startsWith('91')) {
      cleaned = '91' + cleaned;
    }
    
    return cleaned;
  }

// In WhatsAppController class, ensure this function exists:
async uploadMedia(fileBuffer, mimeType, filename) {
  try {
    console.log(`Uploading media: ${filename}, Size: ${(fileBuffer.length / 1024).toFixed(2)}KB, Type: ${mimeType}`);
    
    if (!fileBuffer || fileBuffer.length === 0) {
      throw new Error('File buffer is empty');
    }
    
    // Check file size limits
    const maxSize = mimeType.startsWith('video/') ? 16 * 1024 * 1024 : 5 * 1024 * 1024;
    
    if (fileBuffer.length > maxSize) {
      throw new Error(`File too large: ${(fileBuffer.length / 1024 / 1024).toFixed(2)}MB (max: ${(maxSize / 1024 / 1024).toFixed(2)}MB)`);
    }

    const formData = new FormData();
    formData.append('file', fileBuffer, {
      filename: filename,
      contentType: mimeType
    });
    formData.append('messaging_product', 'whatsapp');
    formData.append('type', mimeType);

    console.log(`Making POST request to: ${this.mediaUrl}`);
    
    const response = await axios.post(
      this.mediaUrl,
      formData,
      {
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
          ...formData.getHeaders()
        },
        timeout: 30000,
        maxBodyLength: Infinity,
        maxContentLength: Infinity
      }
    );

    console.log('✓ Media uploaded successfully, ID:', response.data.id);
    return response.data.id;
  } catch (error) {
    const errorMessage = error.response?.data?.error?.message || error.message;
    const errorCode = error.response?.data?.error?.code;
    console.error('✗ Error uploading media:', {
      message: errorMessage,
      code: errorCode,
      status: error.response?.status
    });
    throw new Error(`Upload failed: ${errorMessage} (Code: ${errorCode})`);
  }
}
  // Send shop video to customer
  async sendShopVideoToCustomer(req, res) {
    try {
      const { video, customerPhone, customerName, deviceModel, deviceIssue } = req.body;
      
      console.log('\n' + '='.repeat(60));
      console.log('📤 SENDING SHOP VIDEO TO CUSTOMER');
      console.log('='.repeat(60));
      console.log('- Customer:', customerName);
      console.log('- Phone:', customerPhone);
      console.log('- Device:', deviceModel);
      console.log('- Issue:', deviceIssue);
      console.log('- Video present:', !!video);
      console.log('- Video size:', video ? `${(Buffer.from(video, 'base64').length / 1024 / 1024).toFixed(2)}MB` : 'N/A');
      
      if (!video || !customerPhone) {
        return res.status(400).json({
          success: false,
          message: 'Video and customer phone number are required'
        });
      }
      
      // Format phone number
      const formattedPhone = this.formatPhoneNumber(customerPhone);
      if (!formattedPhone) {
        return res.status(400).json({
          success: false,
          message: 'Invalid phone number format'
        });
      }
      
      // Check WhatsApp credentials
      if (!this.accessToken || !this.phoneNumberId) {
        return res.status(400).json({
          success: false,
          message: 'WhatsApp API not configured'
        });
      }
      
      // Convert base64 to buffer
      const videoBuffer = Buffer.from(video, 'base64');
      const videoSizeMB = (videoBuffer.length / 1024 / 1024).toFixed(2);
      console.log(`📊 Video buffer size: ${videoSizeMB}MB`);
      
      // Check video size
      if (videoBuffer.length > 16 * 1024 * 1024) {
        return res.status(400).json({
          success: false,
          message: `Video too large (${videoSizeMB}MB). WhatsApp maximum is 16MB.`
        });
      }
      
      let videoMediaId = null;
      let videoSent = false;
      
      try {
        // Step 1: Upload video to WhatsApp
        console.log('📤 Step 1: Uploading video to WhatsApp...');
        videoMediaId = await this.uploadMedia(
          videoBuffer,
          'video/mp4',
          `Device_Condition_${Date.now()}.mp4`
        );
        
        console.log('✅ Video uploaded, Media ID:', videoMediaId);
        
        // Step 2: Send intro message
        console.log('💬 Step 2: Sending intro message...');
        const introMessage = `🔧 *Device Inspection Update*

Hello ${customerName},

We have recorded a video showing the current condition of your device for your reference:

📱 *Device:* ${deviceModel || 'Not specified'}
🔧 *Issue:* ${deviceIssue || 'Not specified'}`;
        
        await this.sendTextMessageInternal(formattedPhone, introMessage);
        console.log('✅ Intro message sent');
        
        // Step 3: Send the video
        console.log('🎥 Step 3: Sending video...');
        const videoCaption = `📹 *Device Condition Video*

Device: ${deviceModel || 'Not specified'}
Issue: ${deviceIssue || 'Not specified'}

This video shows the current condition as recorded by our technician.`;
        
        await axios.post(
          this.baseUrl,
          {
            messaging_product: 'whatsapp',
            recipient_type: 'individual',
            to: formattedPhone,
            type: 'video',
            video: {
              id: videoMediaId,
              caption: videoCaption.substring(0, 1024)
            }
          },
          {
            headers: {
              'Authorization': `Bearer ${this.accessToken}`,
              'Content-Type': 'application/json'
            },
            timeout: 15000
          }
        );
        
        videoSent = true;
        console.log('✅ Video sent to customer');
        
        // Step 4: Send follow-up message
        console.log('📋 Step 4: Sending follow-up message...');
        const followUpMessage = `📋 *Next Steps:*

1. Review the device condition in the video
2. We'll proceed with repair as discussed
3. You'll receive updates on repair progress
4. Contact us if you have any questions

📍 *Shop Address:* Sri Ramanar Mobile Service Center
1E, Kattabomman Street, Tiruvannamalai - 606601
📞 *Phone:* 94430 19097
⏰ *Hours:* 9AM - 9:30PM (Closed Tuesday)

Thank you for choosing our service! 🙏`;
        
        await this.sendTextMessageInternal(formattedPhone, followUpMessage);
        console.log('✅ Follow-up message sent');
        
        // Step 5: Try to find and update job in database
        try {
          // Find customer by phone
          const customer = await Customer.findOne({ phone: customerPhone });
          if (customer) {
            // Find latest job for this customer
            const job = await Job.findOne({
              customer: customer._id
            }).sort({ createdAt: -1 });
            
            if (job) {
              job.shop_video_sent = new Date();
              job.shop_video_sent_to_customer = true;
              job.shop_video_size = videoBuffer.length;
              await job.save();
              console.log('✅ Job updated with video sent info');
            }
          }
        } catch (dbError) {
          console.error('⚠️ Error updating job:', dbError.message);
          // Non-critical error, continue
        }
        
        console.log('\n' + '='.repeat(60));
        console.log('✅ VIDEO SENT SUCCESSFULLY!');
        console.log('='.repeat(60));
        console.log(`Customer: ${customerName}`);
        console.log(`Phone: ${customerPhone}`);
        console.log(`Video size: ${videoSizeMB}MB`);
        console.log('='.repeat(60));
        
        res.json({
          success: true,
          message: 'Device video sent to customer successfully',
          customerName,
          customerPhone,
          deviceModel,
          videoSize: `${videoSizeMB}MB`,
          videoSent: true,
          timestamp: new Date().toISOString()
        });
        
      } catch (error) {
        console.error('\n❌ Error sending video:', error.message);
        
        // If video upload succeeded but sending failed, send error message
        if (videoMediaId && !videoSent) {
          try {
            const errorMessage = `⚠️ *Video Upload Issue*

We recorded a video but encountered an issue sending it. Please visit our shop to see the video.

Device: ${deviceModel}
Issue: ${deviceIssue}

Thank you!`;
            await this.sendTextMessageInternal(formattedPhone, errorMessage);
          } catch (sendError) {
            console.error('Failed to send error message:', sendError.message);
          }
        }
        
        res.status(500).json({
          success: false,
          message: 'Failed to send device video',
          error: error.response?.data?.error?.message || error.message,
          videoSize: `${videoSizeMB}MB`,
          videoSent: false
        });
      }
      
    } catch (error) {
      console.error('❌ Error in sendShopVideoToCustomer:', error.message);
      console.error('Stack:', error.stack);
      
      res.status(500).json({
        success: false,
        message: 'Unexpected error sending video',
        error: error.message
      });
    }
  }
  // Send template with document header
  async sendTemplateWithDocument(phoneNumber, pdfMediaId, jobData) {
    try {
      const formattedPhone = this.formatPhoneNumber(phoneNumber);
      console.log(`Sending template to: ${formattedPhone} (original: ${phoneNumber})`);
      
      const templateData = {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: formattedPhone,
        type: 'template',
        template: {
          name: this.templateName,
          language: { code: 'en' },
          components: [
            {
              type: "header",
              parameters: [
                {
                  type: "document",
                  document: {
                    id: pdfMediaId,
                    filename: `Job_Bill_${jobData.jobCardNumber}.pdf`
                  }
                }
              ]
            },
            {
              type: "body",
              parameters: [
                { type: "text", text: jobData.customerName.substring(0, 30) },
                { type: "text", text: jobData.jobCardNumber.substring(0, 20) },
                { type: "text", text: jobData.deviceModel.substring(0, 30) },
                { type: "text", text: jobData.issue.substring(0, 30) },
                { type: "text", text: jobData.estimatedDate.substring(0, 20) },
                { type: "text", text: `${jobData.totalAmount.toFixed(2)}` }
              ]
            },
            {
              type: "button",
              sub_type: "quick_reply",
              index: "0",
              parameters: [
                {
                  type: "payload",
                  payload: "record_device_video"
                }
              ]
            }
          ]
        }
      };

      console.log('Template data:', JSON.stringify(templateData, null, 2));
      
      const response = await axios.post(this.baseUrl, templateData, {
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json'
        },
        timeout: 15000
      });
      
      console.log('✓ Template with document sent successfully');
      console.log('Response:', response.data);
      return response.data;
    } catch (error) {
      const errorMessage = error.response?.data?.error?.message || error.message;
      const errorCode = error.response?.data?.error?.code;
      const errorType = error.response?.data?.error?.type;
      
      console.error('✗ Error sending template with document:', {
        message: errorMessage,
        code: errorCode,
        type: errorType,
        status: error.response?.status,
        data: error.response?.data
      });
      
      throw new Error(`Template send failed: ${errorMessage} (Code: ${errorCode})`);
    }
  }

  // Send text message internally
  async sendTextMessageInternal(phoneNumber, text) {
    try {
      const formattedPhone = this.formatPhoneNumber(phoneNumber);
      
      console.log('🔄 Preparing to send text message...');
      console.log('- Original phone:', phoneNumber);
      console.log('- Formatted phone:', formattedPhone);
      console.log('- Message length:', text.length, 'characters');
      console.log('- First 100 chars:', text.substring(0, 100) + '...');
      
      if (!formattedPhone) {
        throw new Error('Invalid phone number format');
      }
      
      const payload = {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: formattedPhone,
        type: 'text',
        text: {
          preview_url: false,
          body: text.substring(0, 4096)
        }
      };
      
      console.log('📤 Sending payload to WhatsApp API...');
      
      const response = await axios.post(
        this.baseUrl,
        payload,
        {
          headers: {
            'Authorization': `Bearer ${this.accessToken}`,
            'Content-Type': 'application/json'
          },
          timeout: 10000
        }
      );
      
      console.log('✅ WhatsApp API Response:');
      console.log('- Status:', response.status);
      console.log('- Message ID:', response.data?.messages?.[0]?.id || 'Not provided');
      console.log('- Response data:', JSON.stringify(response.data, null, 2));
      
      console.log('✓ Text message sent to:', formattedPhone);
      return response.data;
    } catch (error) {
      const errorMessage = error.response?.data?.error?.message || error.message;
      const errorCode = error.response?.data?.error?.code;
      
      console.error('✗ Error in sendTextMessageInternal:');
      console.error('- Error message:', errorMessage);
      console.error('- Error code:', errorCode);
      console.error('- Status code:', error.response?.status);
      
      if (error.response?.data) {
        console.error('- Full error response:', JSON.stringify(error.response.data, null, 2));
      }
      
      throw new Error(`Text send failed: ${errorMessage} (Code: ${errorCode})`);
    }
  }

  // MAIN: Send job intake notification with media
  async sendJobIntakeWithMedia(req, res) {
    const startTime = Date.now();
    let job = null;
    
    try {
      const { jobId } = req.params;
      
      console.log(`\n${'='.repeat(60)}`);
      console.log(`WHATSAPP: Processing template with document for job: ${jobId}`);
      console.log(`${'='.repeat(60)}`);
      
      // Debug the request structure
      console.log('Request debug info:');
      console.log('- Has req.file:', !!req.file);
      console.log('- Has req.files:', !!req.files);
      if (req.files) {
        console.log('- req.files keys:', Object.keys(req.files));
        console.log('- req.files content:', JSON.stringify(Object.keys(req.files)));
      }
      console.log('- Has req.body:', !!req.body);
      if (req.body) {
        console.log('- req.body keys:', Object.keys(req.body).filter(k => k !== 'pdf' || req.body[k].length < 100));
      }
      
      // Find PDF file in request
      let pdfFile = null;
      
      // Check different possible locations for the PDF
      if (req.files && req.files.pdf) {
        // Handle array or single file
        if (Array.isArray(req.files.pdf) && req.files.pdf[0]) {
          pdfFile = req.files.pdf[0];
          console.log('Found PDF in req.files.pdf[0]');
        } else if (req.files.pdf.buffer) {
          pdfFile = req.files.pdf;
          console.log('Found PDF in req.files.pdf (single object)');
        }
      } else if (req.file) {
        pdfFile = req.file;
        console.log('Found PDF in req.file');
      }
      
      if (!pdfFile) {
        console.error('❌ No PDF file found in request!');
        console.log('Falling back to simple notification...');
        return await this.sendJobIntakeNotification(req, res);
      }
      
      console.log(`✅ PDF found: ${pdfFile.originalname || 'unnamed'}`);
      console.log(`   Size: ${(pdfFile.size || pdfFile.buffer?.length || 0) / 1024} KB`);
      console.log(`   MIME type: ${pdfFile.mimetype || 'unknown'}`);
      
      if (!pdfFile.buffer || pdfFile.buffer.length === 0) {
        console.error('❌ PDF buffer is empty!');
        return await this.sendJobIntakeNotification(req, res);
      }
      
      // Get job details from database
      job = await Job.findById(jobId)
        .populate('customer')
        .populate('taken_by_worker', 'name');

      if (!job) {
        console.error('❌ Job not found:', jobId);
        return res.status(404).json({ 
          success: false, 
          error: 'Job not found',
          jobId 
        });
      }

      if (!job.customer?.phone) {
        console.error('❌ Customer phone not found for job:', jobId);
        return res.status(400).json({
          success: false,
          message: 'Customer phone number not found',
          jobId: job._id,
          customerName: job.customer?.name
        });
      }

      const phoneNumber = job.customer.phone;
      const formattedPhone = this.formatPhoneNumber(phoneNumber);
      const customerName = job.customer.name;
      const jobCardNumber = job.job_card_number || job._id.toString().slice(-6);
      const deviceModel = `${job.device_brand || ''} ${job.device_model}`.trim();
      const issue = job.reported_issue || 'Not specified';
      const estimatedDate = job.estimated_delivery_date ? 
        new Date(job.estimated_delivery_date).toLocaleDateString('en-IN') : 'Will inform soon';
      const totalAmount = job.total_amount || 0;

      console.log(`\n📋 Job Details:`);
      console.log(`   ID: ${jobCardNumber}`);
      console.log(`   Customer: ${customerName}`);
      console.log(`   Phone: ${phoneNumber} -> ${formattedPhone}`);
      console.log(`   Device: ${deviceModel}`);
      console.log(`   Issue: ${issue}`);
      console.log(`   Est. Delivery: ${estimatedDate}`);
      console.log(`   Amount: ₹${totalAmount}`);

      // Check WhatsApp credentials
      if (!this.accessToken || !this.phoneNumberId) {
        console.error('❌ WhatsApp credentials not set');
        return res.status(200).json({
          success: false,
          message: 'WhatsApp API not configured',
          error: 'Missing credentials',
          jobCreated: true,
          jobId: job._id,
          note: 'Job created. WhatsApp skipped due to missing credentials.'
        });
      }

      // Results tracking
      const results = {
        template: { sent: false, error: null, method: null, details: null },
        document: { uploaded: false, sent: false, mediaId: null }
      };

      try {
        // STEP 1: Upload PDF as media
        console.log('\n📤 STEP 1: Uploading PDF document for template header...');
        const uploadStart = Date.now();
        
        const pdfMediaId = await this.uploadMedia(
          pdfFile.buffer,
          'application/pdf',
          `Job_Bill_${jobCardNumber}.pdf`
        );
        
        results.document.uploaded = true;
        results.document.mediaId = pdfMediaId;
        results.document.uploadTime = Date.now() - uploadStart;
        console.log(`✅ PDF uploaded in ${results.document.uploadTime}ms, Media ID: ${pdfMediaId}`);
        
        // STEP 2: Send template with document header
        console.log('\n📨 STEP 2: Sending template with document header...');
        const templateStart = Date.now();
        
        const jobData = {
          customerName,
          jobCardNumber,
          deviceModel,
          issue,
          estimatedDate,
          totalAmount
        };
        
        const templateResponse = await this.sendTemplateWithDocument(phoneNumber, pdfMediaId, jobData);
        
        results.template.sent = true;
        results.template.method = 'template_with_document';
        results.template.details = templateResponse;
        results.template.sendTime = Date.now() - templateStart;
        results.document.sent = true;
        
        console.log(`✅ Template sent in ${results.template.sendTime}ms`);
        
      } catch (templateError) {
        console.error('❌ Template with document failed:', templateError.message);
        results.template.error = templateError.message;
        
        // Fallback: Try simple template without document
        console.log('\n🔄 Trying fallback: Simple template without document...');
        try {
          const fallbackData = {
            messaging_product: 'whatsapp',
            recipient_type: 'individual',
            to: formattedPhone,
            type: 'template',
            template: {
              name: this.templateName,
              language: { code: 'en' },
              components: [
                {
                  type: "body",
                  parameters: [
                    { type: "text", text: customerName.substring(0, 30) },
                    { type: "text", text: jobCardNumber.substring(0, 20) },
                    { type: "text", text: deviceModel.substring(0, 30) },
                    { type: "text", text: issue.substring(0, 30) },
                    { type: "text", text: estimatedDate.substring(0, 20) },
                    { type: "text", text: `₹${totalAmount.toFixed(2)}` }
                  ]
                }
              ]
            }
          };
          
          const fallbackResponse = await axios.post(this.baseUrl, fallbackData, {
            headers: {
              'Authorization': `Bearer ${this.accessToken}`,
              'Content-Type': 'application/json'
            },
            timeout: 10000
          });
          
          results.template.sent = true;
          results.template.method = 'template_simple_fallback';
          results.template.details = fallbackResponse.data;
          console.log('✅ Simple template fallback sent');
          
        } catch (fallbackError) {
          console.error('❌ Simple template fallback also failed:', fallbackError.message);
          results.template.error += ` | Fallback: ${fallbackError.message}`;
          
          // Last resort: Send text message
          console.log('\n🔄 Last resort: Sending text message...');
          try {
            const textMessage = `Hello ${customerName},

Your repair job #${jobCardNumber} has been registered!

Device: ${deviceModel}
Issue: ${issue}
Est. Delivery: ${estimatedDate}
Total: ₹${totalAmount.toFixed(2)}

Thank you!`;
            
            await this.sendTextMessageInternal(phoneNumber, textMessage);
            results.template.sent = true;
            results.template.method = 'text_fallback';
            console.log('✅ Text message fallback sent');
            
          } catch (textError) {
            console.error('❌ Text message fallback also failed:', textError.message);
            results.template.error += ` | Text: ${textError.message}`;
          }
        }
      }

      // Update job with notification status
      if (job) {
        job.whatsapp_notification_sent = new Date();
        job.whatsapp_notification_method = results.template.method || 'template_attempted';
        job.whatsapp_template_sent = results.template.sent;
        job.whatsapp_document_sent = results.document.sent;
        job.whatsapp_button_included = true;
        job.whatsapp_notification_details = {
          templateUsed: this.templateName,
          documentIncluded: results.document.sent,
          buttonIncluded: true,
          timestamp: new Date()
        };
        await job.save();
        console.log('✅ Job updated with WhatsApp notification status');
      }

      const totalTime = Date.now() - startTime;

      console.log(`\n${'='.repeat(60)}`);
      console.log(`COMPLETED in ${totalTime}ms`);
      console.log(`Template: ${results.template.sent ? '✅' : '❌'} (${results.template.method})`);
      console.log(`Document: ${results.document.sent ? '✅' : '❌'}`);
      console.log(`Button: ✅ Included`);
      if (results.template.error) console.log(`Error: ${results.template.error}`);
      console.log(`${'='.repeat(60)}\n`);

      return res.json({
        success: results.template.sent,
        message: results.template.sent 
          ? `WhatsApp ${results.template.method} sent successfully`
          : 'WhatsApp notification failed',
        jobId: job?._id || jobId,
        customerName,
        phoneNumber,
        jobCardNumber,
        templateName: this.templateName,
        results: {
          templateSent: results.template.sent,
          templateMethod: results.template.method,
          documentSent: results.document.sent,
          buttonIncluded: true,
          error: results.template.error
        },
        processingTime: `${totalTime}ms`,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      console.error('\n❌ UNEXPECTED ERROR in sendJobIntakeWithMedia:', error.message);
      console.error('Stack:', error.stack);
      
      const totalTime = Date.now() - startTime;
      
      // Try to update job with failure
      if (job) {
        try {
          job.whatsapp_notification_failed = new Date();
          job.whatsapp_failure_reason = error.message;
          await job.save();
        } catch (saveError) {
          console.error('Failed to update job:', saveError.message);
        }
      }
      
      return res.status(500).json({
        success: false,
        message: 'Unexpected error in WhatsApp notification',
        error: error.message,
        jobCreated: true,
        jobId: job?._id || req.params.jobId,
        note: 'An unexpected error occurred. The job was created successfully.',
        processingTime: `${totalTime}ms`,
        timestamp: new Date().toISOString()
      });
    }
  }

  // Simple notification fallback
  async sendJobIntakeNotification(req, res) {
    const startTime = Date.now();
    
    try {
      const { jobId } = req.params;
      
      console.log(`\n📱 SIMPLE NOTIFICATION for job: ${jobId}`);
      
      const job = await Job.findById(jobId)
        .populate('customer')
        .populate('taken_by_worker', 'name');

      if (!job) {
        return res.status(404).json({ 
          success: false, 
          error: 'Job not found',
          jobId 
        });
      }

      if (!job.customer?.phone) {
        return res.status(400).json({
          success: false,
          message: 'Customer phone number not found'
        });
      }

      const phoneNumber = job.customer.phone;
      const formattedPhone = this.formatPhoneNumber(phoneNumber);
      const customerName = job.customer.name;
      const jobCardNumber = job.job_card_number || job._id.toString().slice(-6);
      const deviceModel = `${job.device_brand || ''} ${job.device_model}`.trim();
      const issue = job.reported_issue || 'Not specified';
      const estimatedDate = job.estimated_delivery_date ? 
        new Date(job.estimated_delivery_date).toLocaleDateString('en-IN') : 'Will inform soon';
      const totalAmount = job.total_amount || 0;

      console.log(`Simple notification - Phone: ${phoneNumber}, Job: ${jobCardNumber}`);

      if (!this.accessToken || !this.phoneNumberId) {
        return res.status(200).json({
          success: false,
          message: 'WhatsApp API not configured',
          error: 'Missing credentials',
          jobCreated: true,
          jobId: job._id,
          note: 'Job created. WhatsApp skipped.'
        });
      }

      let templateSent = false;
      let notificationMethod = 'none';
      let templateError = null;
      
      try {
        const templateData = {
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: formattedPhone,
          type: 'template',
          template: {
            name: this.templateName,
            language: { code: 'en' },
            components: [
              {
                type: "body",
                parameters: [
                  { type: "text", text: customerName.substring(0, 30) },
                  { type: "text", text: jobCardNumber.substring(0, 20) },
                  { type: "text", text: deviceModel.substring(0, 30) },
                  { type: "text", text: issue.substring(0, 30) },
                  { type: "text", text: estimatedDate.substring(0, 20) },
                  { type: "text", text: `₹${totalAmount.toFixed(2)}` }
                ]
              }
            ]
          }
        };

        console.log('Sending simple WhatsApp template...');
        
        const response = await axios.post(
          this.baseUrl,
          templateData,
          {
            headers: {
              'Authorization': `Bearer ${this.accessToken}`,
              'Content-Type': 'application/json'
            },
            timeout: 10000
          }
        );
        
        templateSent = true;
        notificationMethod = 'template';
        console.log(`✅ Simple template sent`);
        
      } catch (error) {
        templateError = error.message;
        console.error('❌ Simple template failed:', templateError);
        
        // Try text message as last resort
        try {
          const textMessage = `Hello ${customerName},

Your repair job has been registered!

📋 Job ID: ${jobCardNumber}
📱 Device: ${deviceModel}
🔧 Issue: ${issue}
📅 Est. Delivery: ${estimatedDate}
💰 Total: ₹${totalAmount.toFixed(2)}

Thank you for choosing our service!`;

          await this.sendTextMessageInternal(phoneNumber, textMessage);
          templateSent = true;
          notificationMethod = 'text';
          console.log(`✅ Text message sent`);
          
        } catch (textError) {
          console.error('❌ Text message also failed:', textError.message);
        }
      }

      // Update job
      if (templateSent) {
        job.whatsapp_notification_sent = new Date();
        job.whatsapp_notification_method = notificationMethod;
      } else {
        job.whatsapp_notification_failed = new Date();
        job.whatsapp_failure_reason = templateError || 'Both template and text failed';
      }
      await job.save();

      const processingTime = Date.now() - startTime;

      if (templateSent) {
        return res.json({
          success: true,
          message: `WhatsApp ${notificationMethod} sent successfully`,
          jobId: job._id,
          customerName,
          phoneNumber,
          jobCardNumber,
          notificationMethod,
          processingTime: `${processingTime}ms`
        });
      } else {
        return res.status(200).json({
          success: false,
          message: 'Job created but WhatsApp notification failed',
          jobId: job._id,
          jobCreated: true,
          customerPhone: phoneNumber,
          note: 'The job was created. WhatsApp notification failed.',
          processingTime: `${processingTime}ms`
        });
      }

    } catch (error) {
      console.error('❌ Error in sendJobIntakeNotification:', error);
      
      return res.status(500).json({
        success: false,
        message: 'Unexpected error',
        error: error.message,
        jobCreated: true,
        note: 'An unexpected error occurred.',
        processingTime: `${Date.now() - startTime}ms`
      });
    }
  }

  // Test WhatsApp credentials
  async testWhatsAppCredentials(req, res) {
    try {
      console.log('Testing WhatsApp credentials...');
      
      if (!this.accessToken || !this.phoneNumberId) {
        return res.status(400).json({
          success: false,
          message: 'WhatsApp credentials not configured',
          missing: [
            !this.accessToken ? 'WHATSAPP_ACCESS_TOKEN' : null,
            !this.phoneNumberId ? 'WHATSAPP_PHONE_NUMBER_ID' : null
          ].filter(Boolean)
        });
      }
      
      const testUrl = `https://graph.facebook.com/${this.apiVersion}/${this.phoneNumberId}`;
      console.log('Testing URL:', testUrl);
      
      const response = await axios.get(testUrl, {
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json'
        },
        timeout: 10000
      });
      
      console.log('✅ WhatsApp API test successful');
      
      res.json({
        success: true,
        message: 'WhatsApp credentials are valid',
        phoneNumberInfo: response.data,
        credentials: {
          phoneNumberId: this.phoneNumberId,
          businessAccountId: this.businessAccountId,
          apiVersion: this.apiVersion,
          accessTokenSet: !!this.accessToken,
          templateName: this.templateName
        }
      });
    } catch (error) {
      console.error('❌ WhatsApp credential test failed:', error.response?.data || error.message);
      
      const errorResponse = {
        success: false,
        message: 'WhatsApp credential test failed',
        error: error.response?.data?.error?.message || error.message
      };
      
      if (error.response?.data?.error) {
        errorResponse.facebookError = error.response.data.error;
      }
      
      res.status(500).json(errorResponse);
    }
  }

  // Send text message API
  async sendTextMessage(req, res) {
    try {
      const { phoneNumber, text } = req.body;

      if (!phoneNumber || !text) {
        return res.status(400).json({
          success: false,
          message: 'Phone number and text are required'
        });
      }

      console.log(`Sending text message to ${phoneNumber}`);

      if (!this.accessToken || !this.phoneNumberId) {
        return res.status(500).json({
          success: false,
          message: 'WhatsApp API not configured',
          error: 'Missing credentials'
        });
      }

      const result = await this.sendTextMessageInternal(phoneNumber, text);

      res.json({
        success: true,
        message: 'Text message sent successfully',
        data: result
      });
    } catch (error) {
      console.error('Error sending text message:', error.message);
      res.status(500).json({
        success: false,
        message: 'Failed to send text message',
        error: error.message
      });
    }
  }

  // Handle button click
  async handleButtonClick(req, res) {
    const startTime = Date.now();
    
    try {
      const { jobId, buttonType } = req.params;
      const { phoneNumber } = req.body;
      
      console.log(`\n🔘 Handling button click: ${buttonType} for job: ${jobId}`);
      console.log(`Phone: ${phoneNumber}`);
      
      if (!jobId || !phoneNumber) {
        return res.status(400).json({
          success: false,
          message: 'Job ID and phone number are required'
        });
      }
      
      const job = await Job.findById(jobId)
        .populate('customer')
        .populate('taken_by_worker', 'name');
      
      if (!job) {
        return res.status(404).json({
          success: false,
          message: 'Job not found'
        });
      }
      
      const customerName = job.customer?.name || 'Customer';
      const jobCardNumber = job.job_card_number || job._id.toString().slice(-6);
      const deviceModel = `${job.device_brand || ''} ${job.device_model}`.trim();
      
      let instructionSent = false;
      
      switch(buttonType) {
        case 'record_device_video':
          const instructionMessage = `🎥 *Record Device Video*
          
Hello ${customerName},

Please record a short video of your device:

📱 *What to include:*
• Show device from all angles
• Point out any damage
• Demonstrate the issue
• Keep under 30 seconds

*Reply to this message with your video.*

📋 Job ID: ${jobCardNumber}
📱 Device: ${deviceModel}

Thank you!`;

          await this.sendTextMessageInternal(phoneNumber, instructionMessage);
          instructionSent = true;
          
          // Store button click
          job.whatsapp_button_clicks = job.whatsapp_button_clicks || [];
          job.whatsapp_button_clicks.push({
            button: buttonType,
            clicked_at: new Date(),
            instruction_sent: true
          });
          await job.save();
          
          break;
          
        default:
          return res.status(400).json({
            success: false,
            message: 'Unknown button type'
          });
      }
      
      const totalTime = Date.now() - startTime;
      
      console.log(`✅ Button click handled in ${totalTime}ms`);
      
      res.json({
        success: true,
        message: `Button click handled: ${buttonType}`,
        jobId: job._id,
        customerName,
        jobCardNumber,
        buttonType,
        instructionSent,
        processingTime: `${totalTime}ms`
      });
      
    } catch (error) {
      console.error('❌ Error handling button click:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to handle button click',
        error: error.message,
        processingTime: `${Date.now() - startTime}ms`
      });
    }
  }

async sendDeviceVideo(req, res) {
  const startTime = Date.now();
  
  try {
    const { jobId } = req.params;
    const { phoneNumber } = req.query;
    
    console.log(`\n🎥 Sending device video for job: ${jobId}`);
    
    // Get job details
    const job = await Job.findById(jobId);
    if (!job) {
      return res.status(404).json({
        success: false,
        message: 'Job not found'
      });
    }
    
    const jobCardNumber = job.job_card_number || job._id.toString().slice(-6);
    const deviceModel = `${job.device_brand || ''} ${job.device_model}`.trim();
    const customerName = job.customer?.name || 'Customer';
    
    // Get video file
    let videoFile = req.file;
    if (!videoFile && req.files?.video) {
      videoFile = Array.isArray(req.files.video) ? req.files.video[0] : req.files.video;
    }
    
    if (!videoFile || !videoFile.buffer || videoFile.size === 0) {
      return res.status(400).json({
        success: false,
        message: 'No valid video file found'
      });
    }
    
    console.log(`✅ Video file: ${videoFile.originalname}, Size: ${(videoFile.size / 1024 / 1024).toFixed(2)}MB`);
    
    // ✅ SOLUTION 1: Log video format info
    console.log('🎬 Video format debug:', {
      size: videoFile.size,
      mimetype: videoFile.mimetype,
      firstBytes: videoFile.buffer.slice(0, 20).toString('hex'),
      isMP4: videoFile.mimetype?.includes('mp4'),
      isWebM: videoFile.mimetype?.includes('webm')
    });
    
    // Format phone number
    const formattedPhone = this.formatPhoneNumber(phoneNumber);
    console.log(`📱 Sending to: ${formattedPhone} (original: ${phoneNumber})`);
    
    if (!formattedPhone) {
      return res.status(400).json({
        success: false,
        message: 'Invalid phone number'
      });
    }
    
    let videoSent = false;
    let videoError = null;
    let videoMediaId = null;
    let whatsappResponse = null;
    let sendMethod = 'video'; // Default to sending as video
    
    try {
      // 1. Upload video to WhatsApp media server
      console.log('📤 Step 1: Uploading video to WhatsApp...');
      
      // ✅ Check if video is too large
      if (videoFile.size > 16 * 1024 * 1024) {
        console.log('⚠️ Video is large, trying to compress...');
        // Note: In production, you'd want to compress the video here
        // For now, we'll just continue with the original
      }
      
      videoMediaId = await this.uploadMedia(
        videoFile.buffer,
        videoFile.mimetype || 'video/mp4',
        `Device_Video_${jobCardNumber}.mp4`
      );
      
      console.log(`✅ Video uploaded! Media ID: ${videoMediaId}`);
      
      // ✅ SOLUTION 2: Try sending as DOCUMENT first (more reliable)
      console.log('\n📨 Step 2: Trying to send as DOCUMENT (more reliable)...');
      
      const documentMessage = {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: formattedPhone,
        type: 'document',
        document: {
          id: videoMediaId,
          filename: `Device_Video_${jobCardNumber}.mp4`,
          caption: `📱 Device Condition Video

Job ID: ${jobCardNumber}
Device: ${deviceModel}
Customer: ${customerName}`
        }
      };
      
      console.log('Document message payload:', JSON.stringify(documentMessage, null, 2));
      
      try {
        // First try: Send as document
        whatsappResponse = await axios.post(
          this.baseUrl,
          documentMessage,
          {
            headers: {
              'Authorization': `Bearer ${this.accessToken}`,
              'Content-Type': 'application/json'
            },
            timeout: 20000
          }
        );
        
        sendMethod = 'document';
        console.log('✅ Document sent successfully!');
        
      } catch (documentError) {
        console.log('❌ Document send failed, trying as VIDEO...');
        
        // Fallback: Try sending as video
        const videoMessage = {
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: formattedPhone,
          type: 'video',
          video: {
            id: videoMediaId,
            caption: `📱 Device Condition Video

Job ID: ${jobCardNumber}
Device: ${deviceModel}
Customer: ${customerName}`
          }
        };
        
        console.log('Video message payload:', JSON.stringify(videoMessage, null, 2));
        
        whatsappResponse = await axios.post(
          this.baseUrl,
          videoMessage,
          {
            headers: {
              'Authorization': `Bearer ${this.accessToken}`,
              'Content-Type': 'application/json'
            },
            timeout: 20000
          }
        );
        
        sendMethod = 'video';
        console.log('✅ Video sent successfully!');
      }
      
      // ✅ SOLUTION 3: Check WhatsApp API response
      console.log('📊 WhatsApp API Response:', JSON.stringify(whatsappResponse.data, null, 2));
      
      if (whatsappResponse.data.messages && whatsappResponse.data.messages[0].id) {
        console.log(`✅ ${sendMethod.toUpperCase()} message accepted by WhatsApp`);
        console.log(`Message ID: ${whatsappResponse.data.messages[0].id}`);
        
        videoSent = true;
        
        // Check message status after delay
        setTimeout(async () => {
          try {
            const messageId = whatsappResponse.data.messages[0].id;
            const statusUrl = `https://graph.facebook.com/${this.apiVersion}/${messageId}`;
            
            const statusResponse = await axios.get(statusUrl, {
              headers: {
                'Authorization': `Bearer ${this.accessToken}`
              }
            });
            
            console.log('📊 Message delivery status:', JSON.stringify(statusResponse.data, null, 2));
            
            // Update job with delivery status
            job.device_video_delivery_status = statusResponse.data;
            await job.save();
            
          } catch (statusError) {
            console.error('⚠️ Error checking delivery status:', statusError.message);
          }
        }, 3000);
        
      } else {
        videoError = 'WhatsApp did not return a message ID';
        console.error('❌', videoError);
      }
      
      // 3. Send confirmation text with instructions
      console.log('\n💬 Step 3: Sending confirmation message with instructions...');
      try {
        let confirmMessage = '';
        
        if (sendMethod === 'document') {
          confirmMessage = `✅ *Device Video Recorded & Sent*

Hello ${customerName},

We have recorded a video of your device condition.

📋 *Job ID:* ${jobCardNumber}
📱 *Device:* ${deviceModel}
📎 *Video:* Sent as a document file

*To view:*
1. Open this chat
2. Tap on "📎 Documents"
3. Find "Device_Video_${jobCardNumber}.mp4"
4. Download and play

Thank you! 🙏`;
        } else {
          confirmMessage = `✅ *Device Video Recorded & Sent*

Hello ${customerName},

We have recorded a video of your device condition.

📋 *Job ID:* ${jobCardNumber}
📱 *Device:* ${deviceModel}
🎥 *Video:* Sent above this message

*If video not visible:*
1. Check "Media" tab in chat
2. Ensure auto-download is enabled
3. Restart WhatsApp if needed

Thank you! 🙏`;
        }
        
        await this.sendTextMessageInternal(formattedPhone, confirmMessage);
        console.log('✅ Confirmation message sent with viewing instructions');
        
      } catch (textError) {
        console.log('⚠️ Text confirmation failed, but video was sent');
      }
      
      // 4. Send troubleshooting tips if video sent as document
      if (sendMethod === 'document') {
        try {
          setTimeout(async () => {
            const tipsMessage = `💡 *Video Viewing Tips:*

If you can't see the video:

1. *Check Documents tab:* Look for "📎 Documents" in chat
2. *File name:* Device_Video_${jobCardNumber}.mp4
3. *File size:* ${(videoFile.size / 1024 / 1024).toFixed(2)}MB
4. *Need help?* Reply "HELP" or call 94430 19097`;
            
            await this.sendTextMessageInternal(formattedPhone, tipsMessage);
            console.log('✅ Troubleshooting tips sent');
          }, 2000);
        } catch (tipsError) {
          console.log('⚠️ Tips message failed');
        }
      }
      
    } catch (error) {
      videoError = error.message;
      console.error('❌ Error in video process:', videoError);
      
      if (error.response) {
        console.error('❌ Error response:', JSON.stringify(error.response.data, null, 2));
        console.error('❌ Error status:', error.response.status);
        
        // Try to send error message to customer
        try {
          const errorMsg = `⚠️ *Video Sending Issue*

We recorded your device video but encountered an issue.

📋 Job ID: ${jobCardNumber}
📱 Device: ${deviceModel}

Please visit our shop to view the video:
📍 Sri Ramanar Mobile Service Center
1E, Kattabomman Street, Tiruvannamalai
📞 94430 19097

Thank you!`;
          
          await this.sendTextMessageInternal(formattedPhone, errorMsg);
        } catch (sendError) {
          console.error('Failed to send error message:', sendError);
        }
      }
    }
    
    // Update job
    job.device_video_received = videoSent;
    job.device_video_received_at = new Date();
    job.device_video_sent_to_whatsapp = videoSent;
    job.device_video_send_method = sendMethod;
    job.device_video_whatsapp_id = videoMediaId;
    job.device_video_error = videoError;
    job.device_video_whatsapp_response = whatsappResponse?.data;
    await job.save();
    
    const totalTime = Date.now() - startTime;
    
    // Prepare response
    const responseData = {
      success: videoSent,
      message: videoSent 
        ? `Device video sent as ${sendMethod.toUpperCase()} successfully!`
        : `Video upload succeeded but sending failed: ${videoError}`,
      jobId: job._id,
      jobCardNumber,
      customerPhone: phoneNumber,
      videoSent,
      videoSize: `${(videoFile.size / 1024 / 1024).toFixed(2)}MB`,
      videoMediaId: videoMediaId,
      sendMethod: sendMethod,
      whatsappMessageId: whatsappResponse?.data?.messages?.[0]?.id,
      processingTime: `${totalTime}ms`,
      customerInstructions: videoSent ? {
        asDocument: sendMethod === 'document',
        filename: `Device_Video_${jobCardNumber}.mp4`,
        viewInDocuments: sendMethod === 'document',
        viewInMedia: sendMethod === 'video'
      } : null
    };
    
    if (videoSent) {
      res.json(responseData);
    } else {
      res.status(500).json(responseData);
    }
    
  } catch (error) {
    console.error('❌ Error in sendDeviceVideo:', error);
    console.error('Error stack:', error.stack);
    
    res.status(500).json({
      success: false,
      message: 'Failed to process device video',
      error: error.message,
      processingTime: `${Date.now() - startTime}ms`
    });
  }
}


  async handleWebhook(req, res) {
  try {
    // Verify webhook (for initial setup)
    if (req.method === 'GET') {
      const mode = req.query['hub.mode'];
      const token = req.query['hub.verify_token'];
      const challenge = req.query['hub.challenge'];
      
      const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN || '';
      
      if (mode === 'subscribe' && token === VERIFY_TOKEN) {
        console.log('✅ Webhook verified');
        return res.status(200).send(challenge);
      } else {
        return res.status(403).send('Forbidden');
      }
    }
    
    // Handle incoming messages (POST)
    const body = req.body;
    
    console.log('\n📨 Webhook received:', JSON.stringify(body, null, 2));
    
    if (body.object === 'whatsapp_business_account') {
      const entry = body.entry?.[0];
      const changes = entry?.changes?.[0];
      const value = changes?.value;
      
      if (!value) {
        return res.sendStatus(200);
      }
      
      // Handle messages
      if (value.messages) {
        for (const message of value.messages) {
          await this.processIncomingMessage(message, value);
        }
      }
      
      // Handle statuses (delivery, read receipts)
      if (value.statuses) {
        console.log('📊 Message statuses:', value.statuses);
      }
      
      return res.sendStatus(200);
    }
    
    res.sendStatus(404);
  } catch (error) {
    console.error('❌ Webhook error:', error);
    res.sendStatus(500);
  }
}

// Process incoming messages
async processIncomingMessage(message, value) {
  try {
    const from = message.from; // Customer's phone number
    const messageId = message.id;
    const timestamp = message.timestamp;
    
    console.log(`\n📥 Processing message from: ${from}`);
    console.log(`Message ID: ${messageId}`);
    console.log(`Type: ${message.type}`);
    
    // Handle VIDEO messages
    if (message.type === 'video') {
      console.log('🎥 Video message received!');
      await this.handleIncomingVideo(message, from);
    }
    
    // Handle IMAGE messages (in case they send photos)
    else if (message.type === 'image') {
      console.log('📷 Image message received!');
      await this.handleIncomingImage(message, from);
    }
    
    // Handle TEXT messages
    else if (message.type === 'text') {
      console.log('💬 Text message:', message.text.body);
      // Could implement chatbot responses here
    }
    
    // Handle INTERACTIVE REPLIES (quick replies from template buttons)
    else if (message.type === 'interactive') {
      console.log('⚡ Interactive reply:', message.interactive);
      const replyId = message.interactive.button_reply?.id;
      
      if (replyId === 'record_device_video') {
        // Send instructions when button is clicked via webhook
        await this.sendVideoInstructions(from);
      }
    }
    
    // Handle BUTTON REPLIES (from template quick_reply buttons)
    else if (message.type === 'button') {
      console.log('🔘 Button reply:', message.button);
      const buttonPayload = message.button.payload;
      
      if (buttonPayload === 'record_device_video') {
        // Send instructions when button is clicked
        await this.sendVideoInstructions(from);
      }
    }
    
  } catch (error) {
    console.error('❌ Error processing message:', error);
  }
}

// Handle incoming video from customer
async handleIncomingVideo(message, from) {
  const { Job } = require('../models/Schemas');
  const axios = require('axios');
  const FormData = require('form-data');
  
  try {
    console.log('\n🎥 Processing customer video...');
    
    const videoId = message.video.id;
    const mimeType = message.video.mime_type;
    const videoCaption = message.video.caption || '';
    
    console.log(`Video ID: ${videoId}`);
    console.log(`MIME type: ${mimeType}`);
    console.log(`Caption: ${videoCaption}`);
    
    // Step 1: Find the job for this customer
    // Extract phone number without country code for matching
    let cleanFrom = from;
    if (from.startsWith('+91')) {
      cleanFrom = from.substring(3); // Remove +91
    } else if (from.startsWith('91')) {
      cleanFrom = from.substring(2); // Remove 91
    }
    
    const job = await Job.findOne({
      $or: [
        { 'customer.phone': from },
        { 'customer.phone': `+91${cleanFrom}` },
        { 'customer.phone': `91${cleanFrom}` },
        { 'customer.phone': cleanFrom }
      ],
      whatsapp_button_clicks: { 
        $elemMatch: { 
          button: 'record_device_video' 
        } 
      },
      device_video_received: { $ne: true } // Video not yet received
    })
    .sort({ createdAt: -1 }) // Get most recent job
    .populate('customer');
    
    if (!job) {
      console.log('⚠️ No matching job found for this phone number');
      
      // Send acknowledgment anyway
      await this.sendTextMessageInternal(from, 
        '✅ Video received! However, we could not match it to a job. Please contact us with your Job ID.'
      );
      return;
    }
    
    console.log(`✅ Found job: ${job.job_card_number || job._id}`);
    
    // Step 2: Download the video from WhatsApp
    console.log('📥 Downloading video from WhatsApp...');
    
    const mediaUrlResponse = await axios.get(
      `https://graph.facebook.com/${this.apiVersion}/${videoId}`,
      {
        headers: {
          'Authorization': `Bearer ${this.accessToken}`
        }
      }
    );
    
    const videoUrl = mediaUrlResponse.data.url;
    console.log(`Video URL retrieved: ${videoUrl}`);
    
    // Download the actual video file
    const videoResponse = await axios.get(videoUrl, {
      headers: {
        'Authorization': `Bearer ${this.accessToken}`
      },
      responseType: 'arraybuffer',
      timeout: 60000
    });
    
    const videoBuffer = Buffer.from(videoResponse.data);
    console.log(`✅ Video downloaded: ${(videoBuffer.length / 1024 / 1024).toFixed(2)}MB`);
    
    // Step 3: Save video reference to database
    job.device_video_received = true;
    job.device_video_received_at = new Date();
    job.device_video_whatsapp_id = videoId;
    job.device_video_mime_type = mimeType;
    job.device_video_size = videoBuffer.length;
    job.device_video_caption = videoCaption;
    
    // Optional: Store the video buffer in base64 (if your DB supports it)
    // OR upload to your own storage service (S3, Cloudinary, etc.)
    // For now, we'll just store the WhatsApp media ID
    
    await job.save();
    
    console.log('✅ Job updated with video information');
    
    // Step 4: Send confirmation to customer
    const jobCardNumber = job.job_card_number || job._id.toString().slice(-6);
    const deviceModel = `${job.device_brand || ''} ${job.device_model}`.trim();
    
    const confirmationMessage = `✅ *Video Received!*

Thank you for sending the device video.

📋 Job ID: ${jobCardNumber}
📱 Device: ${deviceModel}
🎥 Video: ${(videoBuffer.length / 1024 / 1024).toFixed(2)}MB

Our technician will review the video and proceed with the repair.

We'll keep you updated! 🙏`;
    
    await this.sendTextMessageInternal(from, confirmationMessage);
    
    console.log('✅ Confirmation sent to customer');
    
    // Step 5: Forward video to shop/admin (optional)
    // You could forward this to your shop's WhatsApp number
    const SHOP_WHATSAPP = process.env.SHOP_WHATSAPP_NUMBER;
    
    if (SHOP_WHATSAPP) {
      const adminMessage = `🎥 *New Device Video Received*

📋 Job: ${jobCardNumber}
👤 Customer: ${job.customer.name}
📞 Phone: ${job.customer.phone}
📱 Device: ${deviceModel}
🔧 Issue: ${job.reported_issue}

Video size: ${(videoBuffer.length / 1024 / 1024).toFixed(2)}MB`;
      
      try {
        // Send text notification to admin
        await this.sendTextMessageInternal(SHOP_WHATSAPP, adminMessage);
        
        // Forward the actual video to admin
        // Note: We'll upload it again and send it
        const adminVideoMediaId = await this.uploadMedia(
          videoBuffer,
          mimeType,
          `Customer_Video_${jobCardNumber}.mp4`
        );
        
        await axios.post(
          this.baseUrl,
          {
            messaging_product: 'whatsapp',
            recipient_type: 'individual',
            to: this.formatPhoneNumber(SHOP_WHATSAPP),
            type: 'video',
            video: {
              id: adminVideoMediaId,
              caption: `Device video for Job #${jobCardNumber}`
            }
          },
          {
            headers: {
              'Authorization': `Bearer ${this.accessToken}`,
              'Content-Type': 'application/json'
            }
          }
        );
        
        console.log('✅ Video forwarded to admin');
      } catch (adminError) {
        console.error('⚠️ Failed to forward to admin:', adminError.message);
      }
    }
    
  } catch (error) {
    console.error('❌ Error handling incoming video:', error);
    
    try {
      await this.sendTextMessageInternal(from, 
        '❌ Sorry, there was an error processing your video. Please try again or contact us directly.'
      );
    } catch (sendError) {
      console.error('Failed to send error message:', sendError);
    }
  }
}

// Handle incoming images
async handleIncomingImage(message, from) {
  // Similar to video handling, but for images
  console.log('📷 Image handling not yet implemented');
  
  try {
    await this.sendTextMessageInternal(from, 
      '📷 Thank you for the image! For device condition, please send a video if possible.'
    );
  } catch (error) {
    console.error('Error sending image response:', error);
  }
}

// Send video recording instructions
async sendVideoInstructions(phoneNumber) {
  const instructionMessage = `🎥 *Record Device Video Instructions*

Please record a short video (under 30 seconds) showing:

✓ All angles of your device
✓ Any visible damage or issues
✓ The problem you're experiencing

Then *reply to this message* with your video.

📝 Keep the video under 16MB for best results.

Thank you! 🙏`;

  try {
    await this.sendTextMessageInternal(phoneNumber, instructionMessage);
    console.log('✅ Video instructions sent');
  } catch (error) {
    console.error('❌ Error sending instructions:', error);
  }
}

  // Send job completion notification
  async sendJobCompletionNotification(req, res) {
    const startTime = Date.now();
    
    try {
      const { jobId } = req.params;
      
      console.log(`Processing job completion notification for: ${jobId}`);
      
      // Get job details
      const job = await Job.findById(jobId)
        .populate('customer');
      
      if (!job) {
        return res.status(404).json({
          success: false,
          message: 'Job not found'
        });
      }
      
      if (!job.customer?.phone) {
        return res.status(400).json({
          success: false,
          message: 'Customer phone number not found'
        });
      }

      const phoneNumber = job.customer.phone;
      const formattedPhone = this.formatPhoneNumber(phoneNumber);
      const customerName = job.customer.name;
      const jobCardNumber = job.job_card_number || job._id.toString().slice(-6);
const deviceModel = `${job.device_brand || ''} ${job.device_model}`.trim();
      const totalAmount = job.total_amount || 0;
      const advancePayment = job.advance_payment || 0;
      const balanceAmount = Math.max(0, totalAmount - advancePayment);

      console.log(`Job completion - Phone: ${phoneNumber}, Job: ${jobCardNumber}`);

      // Check WhatsApp credentials
      if (!this.accessToken || !this.phoneNumberId) {
        console.log('❌ WhatsApp credentials not configured');
        console.log('- Access Token:', this.accessToken ? 'Present' : 'Missing');
        console.log('- Phone Number ID:', this.phoneNumberId ? 'Present' : 'Missing');
        
        return res.status(400).json({
          success: false,
          message: 'WhatsApp API not configured',
          error: 'Missing credentials',
          note: 'Job marked as completed. WhatsApp notification skipped.'
        });
      }
      
      console.log('✅ WhatsApp credentials verified');

      let templateSent = false;
      
      // Skip template for completion (use text message for reliability)
      console.log('⏭️ Skipping template for completion notification - using text message for reliability');
      console.log('- Reason: Template parameter mismatch (expected 6, got 3)');
      console.log('- Fallback: Text message is more reliable for completion notifications');
      
      // For completion notifications, always use text message (more reliable)
      console.log('✅ Using text message for completion notification (more reliable than templates)');
      templateSent = false; // We're not using template for completion

      // Always send text message as backup/fallback
      try {
        const collectionMessage = `🎉 *Your Device is Ready!*

Hello ${customerName},

Your repair is complete.

📦 *Ready for Collection:*
• Job ID: ${jobCardNumber}
• Device: ${deviceModel}
• Status: ✅ COMPLETED

💰 *Payment:*
• Total: ₹${totalAmount.toFixed(2)}
• Advance: ₹${advancePayment.toFixed(2)}
• Balance: ₹${balanceAmount.toFixed(2)}

📍 Sri Ramanar Mobile Service Center
1E, Kattabomman Street, Tiruvannamalai

⏰ 9 AM - 9:30 PM (Closed Tuesday)
📞 94430 19097

Please bring your job ID. Thank you! 🙏`;
        
        console.log('📤 Sending text message fallback...');
        console.log('📝 Message content:');
        console.log(collectionMessage);
        console.log('📱 Sending to formatted number:', formattedPhone);
        
        await this.sendTextMessageInternal(phoneNumber, collectionMessage);
        console.log('✅ Text message sent successfully');
      } catch (textError) {
        console.log('❌ Text message also failed:', textError.message);
        // Even if text fails, we still want to mark the attempt
      }

      // Update job
      job.whatsapp_completion_sent = new Date();
      job.whatsapp_completion_method = templateSent ? 'template_and_text' : 'text';
      await job.save();

      const processingTime = Date.now() - startTime;

      res.json({
        success: true,
        message: 'Job completion notification sent',
        jobId: job._id,
        customerName,
        phoneNumber,
        jobCardNumber,
        templateSent,
        processingTime: `${processingTime}ms`
      });

    } catch (error) {
      console.error('❌ Error sending job completion notification:');
      console.error('- Message:', error.message);
      console.error('- Stack:', error.stack);
      
      if (error.response) {
        console.error('- Response status:', error.response.status);
        console.error('- Response data:', error.response.data);
      }
      
      res.status(500).json({
        success: false,
        message: 'Failed to send job completion notification',
        error: error.message,
        errorDetails: error.response?.data || null,
        processingTime: `${Date.now() - startTime}ms`
      });
    }
  }

  // Get message status
  async getMessageStatus(req, res) {
    try {
      const { messageId } = req.params;
      
      if (!this.accessToken) {
        return res.status(400).json({
          success: false,
          message: 'WhatsApp not configured'
        });
      }
      
      const url = `https://graph.facebook.com/${this.apiVersion}/${messageId}`;
      
      const response = await axios.get(url, {
        headers: {
          'Authorization': `Bearer ${this.accessToken}`
        },
        timeout: 10000
      });

      res.json({
        success: true,
        data: response.data
      });
    } catch (error) {
      console.error('❌ Error getting message status:', error.message);
      res.status(500).json({
        success: false,
        message: 'Failed to get message status',
        error: error.message
      });
    }
  }
}

// Create instance and export
const whatsappController = new WhatsAppController();
module.exports = whatsappController;
