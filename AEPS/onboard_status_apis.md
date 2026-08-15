<?php

$curl = curl_init();

curl_setopt_array($curl, array(
  CURLOPT_URL => 'https://apidev.excisofttech.com/api/v1/aeps/onboard_status_check',
  CURLOPT_RETURNTRANSFER => true,
  CURLOPT_ENCODING => '',
  CURLOPT_MAXREDIRS => 10,
  CURLOPT_TIMEOUT => 0,
  CURLOPT_FOLLOWLOCATION => true,
  CURLOPT_HTTP_VERSION => CURL_HTTP_VERSION_1_1,
  CURLOPT_CUSTOMREQUEST => 'POST',
  CURLOPT_POSTFIELDS => array('apiKey' => 'api key','merchantcode' => 'EXT0056','mobile' => '94********30','pipe' => 'bank2'),
));

$response = curl_exec($curl);

curl_close($curl);
echo $response;

                         
             {
    "response_code": 1,
    "status": true,
    "is_approved":"Accepted",
    "message": "Onboarding completed",
    "is_casa": 0|1|2 // [ 0-merchant not allowed or not onboarded for dmt casa services, 1-Merchant can do the DMT casa as well AePS transaction, 2-Pending for bank activation for DMT casa services
}
                            


    {"response_code":2,"status":false,"message":"Merchant mobile not match."}                  
                                                            