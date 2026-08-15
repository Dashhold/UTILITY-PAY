<?php

$curl = curl_init();

curl_setopt_array($curl, array(
  CURLOPT_URL => 'https://apidev.excisofttech.com/api/v1/aeps/merchant_kyc',
  CURLOPT_RETURNTRANSFER => true,
  CURLOPT_ENCODING => '',
  CURLOPT_MAXREDIRS => 10,
  CURLOPT_TIMEOUT => 0,
  CURLOPT_FOLLOWLOCATION => true,
  CURLOPT_HTTP_VERSION => CURL_HTTP_VERSION_1_1,
  CURLOPT_CUSTOMREQUEST => 'POST',
  CURLOPT_POSTFIELDS => array('apiKey' => 'your api key','merchantcode' => 'merchant code','adhaarnumber' => '64**********74','piddata' => 'piddata','dob' => '1997-05-30','pipe' => 'bank2','accessmode' => 'SITE','latitude' => '26.872','longitude' => '75.796'),
));

$response = curl_exec($curl);

curl_close($curl);
echo $response;

                         

                         {
  "status": true,
  "response_code": "1",
  "message": "Merchant Activated Successfully."
}
                            
                                  
                                  {"status":"error","code":400,"message":"Invalid request. Please provide apiKey"}                  
                  