<?php

$curl = curl_init();

curl_setopt_array($curl, array(
  CURLOPT_URL => 'https://apidev.excisofttech.com/api/v1/aeps/get_bank_list',
  CURLOPT_RETURNTRANSFER => true,
  CURLOPT_ENCODING => '',
  CURLOPT_MAXREDIRS => 10,
  CURLOPT_TIMEOUT => 0,
  CURLOPT_FOLLOWLOCATION => true,
  CURLOPT_HTTP_VERSION => CURL_HTTP_VERSION_1_1,
  CURLOPT_CUSTOMREQUEST => 'POST',
));

$response = curl_exec($curl);

curl_close($curl);
echo $response;

                         


                      {
    "status": true,
    "response_code": 1,
    "banklist": {
        "status": true,
        "message": "Request Completed",
        "data": [
            {
                "id": "1",
                "bankName": "Airtel Payment Bank",
                "iinno": "990320",
                "activeFlag": "1"
            },
        ]
    },
    "message": "Bank list successfully fetched"
}
                            
                                     
                                     {"status":"error","code":400,"message":"Invalid request. Please provide apiKey"}                  
                  