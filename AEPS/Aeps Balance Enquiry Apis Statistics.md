<?php

$curl = curl_init();

curl_setopt_array($curl, array(
  CURLOPT_URL => 'https://apidev.excisofttech.com/api/v1/aeps/balanceEnquiry',
  CURLOPT_RETURNTRANSFER => true,
  CURLOPT_ENCODING => '',
  CURLOPT_MAXREDIRS => 10,
  CURLOPT_TIMEOUT => 0,
  CURLOPT_FOLLOWLOCATION => true,
  CURLOPT_HTTP_VERSION => CURL_HTTP_VERSION_1_1,
  CURLOPT_CUSTOMREQUEST => 'POST',
  CURLOPT_POSTFIELDS => array('apiKey' => 'your key','mobile' => 'mobile','latitude' => '26.9124336','longitude' => '75.7872709','adhaarnumber' => 'adhaar','bank_pipe' => 'bank3','device' => 'Mantra','pid' => 'fingerprint','ref_id' => '43324324324324','submerchantid' => 'submerchantid','ipaddress' => '2401:4900:7d8d:eb90:7dc7:fc17:67f4:b244','accessmodetype' => 'SITE','bank' => '1236','remark' => 'BE','type' => 'BE'),
));

$response = curl_exec($curl);

curl_close($curl);
echo $response;

           {
    "status":true,
    "message":"SUCCESS",
    "ackno":57179130,
    "amount":0,
    "balanceamount":1677.72,
    "bankrrn":"5*********1",
    "bankiin":"607066",
    "response_code":1,
    "errorcode":"0000",
    "clientrefno":1*******1,
    "last_aadhar":"0769",
    "name":"P*******O"
}
                            
                                                
{
    "status": false,
    "response_code": 8,
    "message": "The BANK IIN field must contain only numeric characters.<br />\n"
}                  
                  