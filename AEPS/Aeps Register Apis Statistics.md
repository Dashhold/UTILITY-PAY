<?php

$curl = curl_init();

curl_setopt_array($curl, array(
  CURLOPT_URL => 'https://apidev.excisofttech.com/api/v1/aeps/register.php',
  CURLOPT_RETURNTRANSFER => true,
  CURLOPT_ENCODING => '',
  CURLOPT_MAXREDIRS => 10,
  CURLOPT_TIMEOUT => 0,
  CURLOPT_FOLLOWLOCATION => true,
  CURLOPT_HTTP_VERSION => CURL_HTTP_VERSION_1_1,
  CURLOPT_CUSTOMREQUEST => 'POST',
  CURLOPT_POSTFIELDS => array('apiKey' => 'Your_key','mobile' => 'Mobile','adhaarnumber' => 'Your_adhaar','bank_pipe' => 'bank3','device' => 'Mantra','pid' => 'Your_fingerid_pid','latitude' => '26.9124336','longitude' => '75.7872709','ref_id' => '43324324324324','submerchantid' => 'submerchantid','ipaddress' => '2401:4900:7d8d:eb90:7dc7:fc17:67f4:b244','accessmodetype' => 'SITE'),
));

$response = curl_exec($curl);

curl_close($curl);
echo $response;

                         
                         {"status":true,"response_code":1,"message":"User register"}
                            
                                  
      {
    "response_code": 24,
    "status": false,
    "message": "MerchantID not found.,Please onboard merchant"
}                  
                                              