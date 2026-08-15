<?php

$curl = curl_init();

curl_setopt_array($curl, array(
  CURLOPT_URL => 'https://apidev.excisofttech.com/api/v1/aeps/withdrawal',
  CURLOPT_RETURNTRANSFER => true,
  CURLOPT_ENCODING => '',
  CURLOPT_MAXREDIRS => 10,
  CURLOPT_TIMEOUT => 0,
  CURLOPT_FOLLOWLOCATION => true,
  CURLOPT_HTTP_VERSION => CURL_HTTP_VERSION_1_1,
  CURLOPT_CUSTOMREQUEST => 'POST',
  CURLOPT_POSTFIELDS => array('apiKey' => 'your key','mobile' => 'mobile','latitude' => '26.9124336','longitude' => '75.7872709','adhaarnumber' => 'adhaar','bank_pipe' => 'bank3','device' => 'Mantra','pid' => 'fingerprint','ref_id' => '43324324324324','submerchantid' => 'submerchantid','ipaddress' => '2401:4900:7d8d:eb90:7dc7:fc17:67f4:b244','accessmodetype' => 'SITE','bank' => '1236','remark' => 'CW','type' => 'CW','amount'=>100,'MerAuthTxnId'=>'1********5'),
));

$response = curl_exec($curl);

curl_close($curl);
echo $response;


{
    "status":true,
    "message":"Transaction Marked as Success.",
    "response_code":1
}
                            
       {
    "status": false,
    "response_code": 8,
    "message": "The BANK IIN field must contain only numeric characters.<br />\n"
}                  
                                             

                         