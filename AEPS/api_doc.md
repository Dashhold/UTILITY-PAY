api key = Bw6MxIIzqXJ2edfmagbYysyMqWtcWUze

documentation-

how to change api on your website-
<?php

$curl = curl_init();

curl_setopt_array($curl, array(
  CURLOPT_URL => 'https://apidev.excisofttech.com/api/v1/aeps/onboard',
  CURLOPT_RETURNTRANSFER => true,
  CURLOPT_ENCODING => '',
  CURLOPT_MAXREDIRS => 10,
  CURLOPT_TIMEOUT => 0,
  CURLOPT_FOLLOWLOCATION => true,
  CURLOPT_HTTP_VERSION => CURL_HTTP_VERSION_1_1,
  CURLOPT_CUSTOMREQUEST => 'POST',
  CURLOPT_POSTFIELDS => array('apiKey' => 'your_key','mobile' => '$mobile','merchantcode' => '$merchantcode','firm_name' => 'firmname','email' => 'email','is_new' => '1','callback_url' => 'callback url'),
));

$response = curl_exec($curl);

curl_close($curl);
echo $response;


api sucsess response-
{
    "status": true,
    "response_code": 1,
    "redirecturl": "https://merchantkyc.com/onboarding?env=eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJwYXJ0bmVyaWQiOiIzMDIxNzk1MiIsIm1lcmNoYW50Y29kZSI6IlNIODY1NjEiLCJtb2JpbGUiOiI5Njk0MzEwOTY5IiwiaXNfbmV3IjoiMSIsImVtYWlsIjoicmF2aWRodWhhcml5YUBnbWFpbC5jb20iLCJmaXJtbmFtZSI6IlNIODY1NjEiLCJyZXFpZCI6IjE3Mzg0ODE3OTAyNDQ1IiwiY2FsbGJhY2siOiJodHRwczpcL1wvanVzdGFwaW9uLmNvbVwvIiwiY3VycmVudF90aW1lIjoxNzM4NDgxNzkwfQ.ifVckO9GDI_CDcnTiJo8ahQHocMofWlwpgSwngX5bh4",
    "onboard_pending": 1,
    "message": "Balance successfully fetched"
}
                        
api fall response-
{
    "status": "error",
    "message": "The field 'merchantcode' is required and cannot be empty."
}                  
                  