<?php

$curl = curl_init();

curl_setopt_array($curl, array(
  CURLOPT_URL => 'https://apidev.excisofttech.com/api/v1/aeps/miniStatement',
  CURLOPT_RETURNTRANSFER => true,
  CURLOPT_ENCODING => '',
  CURLOPT_MAXREDIRS => 10,
  CURLOPT_TIMEOUT => 0,
  CURLOPT_FOLLOWLOCATION => true,
  CURLOPT_HTTP_VERSION => CURL_HTTP_VERSION_1_1,
  CURLOPT_CUSTOMREQUEST => 'POST',
  CURLOPT_POSTFIELDS => array('apiKey' => 'your key','mobile' => 'mobile','latitude' => '26.9124336','longitude' => '75.7872709','adhaarnumber' => 'adhaar','bank_pipe' => 'bank3','device' => 'Mantra','pid' => 'fingerprint','ref_id' => '43324324324324','submerchantid' => 'submerchantid','ipaddress' => '2401:4900:7d8d:eb90:7dc7:fc17:67f4:b244','accessmodetype' => 'SITE','bank' => '1236','remark' => 'MS','type' => 'MS'),
));

$response = curl_exec($curl);

curl_close($curl);
echo $response;

                         
                         {
    "status":true,
    "ackno":38808985,
    "datetime":"2024-12-28 14:05:14",
    "balanceamount":2661,
    "bankrrn":"436314009323",
    "bankiin":"607027",
    "message":"Mini statement has been generated successfully.",
    "errorcode":"0",
    "ministatement":[
        {
            "date":"20\/12",
            "amount":2596,
            "txnType":"C",
            "narration":"FIK\/D\/hrough PFM"
        },
        {
            "date":"12\/09",
            "amount":3,
            "txnType":"C",
            "narration":"FIK\/D\/0041320:01"
        },
        {
            "date":"08\/08",
            "amount":300,
            "txnType":"D",
            "narration":"FIK\/W\/10152\/regi"
        },
        {
            "date":"06\/07",
            "amount":500,
            "txnType":"D",
            "narration":"FIK\/W\/05709\/regi"
        }
    ],
    "pipe":"bank2",
    "ministatementlist":[],
    "response_code":1,
    "last_aadhar":"8743",
    "name":"DEEN MOHD",
    "clientrefno":1735374914
}
                            

         {
    "status": false,
    "response_code": 8,
    "message": "The BANK IIN field must contain only numeric characters.<br />\n"
}                  
                                           