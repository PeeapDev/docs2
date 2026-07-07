Here are the Peeap API endpoints for student data and fees:                  
                                                                               
  Student Verification                                                         
                                                                               
  POST /api/peeap/verify-student                                               
  Body:                                                                        
  {                                                                            
    "index_number": "SL-2024-01-0001",                                         
    "school_id": 1                                                             
  }                                                                            
  Or use admission_no instead of index_number.                                 
                                                                               
  ---                                                                          
  Student Financials (Fees & Wallet)                                           
                                                                               
  POST /api/peeap/student-financials                                           
  Body:                                                                        
  {                                                                            
    "student_id": 123,                                                         
    "school_id": 1                                                             
  }                                                                            
                                                                               
  Response includes:                                                           
  - wallet_balance, lunch_balance, transport_balance                           
  - fees_summary (total, paid, balance)                                        
  - fees array with each fee's:                                                
    - id, fees_master_id, name, group                                          
    - term, term_id (for per-term payments)                                    
    - amount, paid, balance, status                                            
    - due_date                                                                 
  - recent_transactions                                                        
                                                                               
  ---                                                                          
  Pay Fee                                                                      
                                                                               
  POST /api/peeap/pay-fee                                                      
  Body:                                                                        
  {                                                                            
    "student_id": 123,                                                         
    "fee_id": 456,                                                             
    "amount": 100.00,                                                          
    "transaction_id": "TXN123",                                                
    "payer_email": "parent@example.com",                                       
    "school_id": 1                                                             
  }                                                                            
                                                                               
  ---                                                                          
  QR Code Payment Lookup (for bus/wallet)                                      
                                                                               
  GET /api/peeap/payment/lookup?qr_code=student-123&school_id=1                
                                                                               
  ---                                                                          
  School Info (includes fees list)                                             
                                                                               
  GET /api/peeap/school-info?school_id=1                                       
  Or use subdomain: ?subdomain=schoolname  