UAT Checklist – Required Logs & Explanations

For every API where Request Body is required, partners must include the below structure with BOTH encrypted and decrypted values:
Request Body Format (Mandatory for All API Logs)
●	{
●	  "encryptedSessionKey": "...",     // Provide both encrypted and decrypted values
●	  "encryptedPayload": "...",        // Provide both encrypted and decrypted values
●	  "keyVersion": "Real Value",
●	  "iv": "Real Value"
●	}

________________________________________
1. Token Generation API – Success Cases
Provide:
●	Complete cURL Request (including headers)

●	Request URL

●	Request Body (include encrypted + decrypted parts)

●	Response

________________________________________
2. Token Generation API – Failed Cases
Provide:
●	Complete cURL Request (including headers)

●	Request URL

●	Request Body (include encrypted + decrypted parts)

●	Response

________________________________________
3. Balance Check API – Success Cases
Provide:
●	Complete cURL Request (including headers)

●	Request URL

●	Request Body (include encrypted + decrypted parts)

●	Response

________________________________________
4. Balance Check API – Failed Cases
Provide:
●	Complete cURL Request (including headers)

●	Request URL

●	Request Body (include encrypted + decrypted parts)

●	Response

________________________________________
5. Validation API – Success Cases
Provide:
●	Complete cURL Request (including headers)

●	Request URL

●	Request Body (include encrypted + decrypted parts)

●	Response

________________________________________
6. Validation API – Failed Cases
Provide:
●	Complete cURL Request (including headers)

●	Request URL

●	Request Body (include encrypted + decrypted parts)

●	Response

________________________________________
7. View Bill API – Success Cases
Provide:
●	Complete cURL Request (including headers)

●	Request URL

●	Request Body (include encrypted + decrypted parts)

●	Response

________________________________________
8. View Bill API – Failed Cases
Provide:
●	Complete cURL Request (including headers)

●	Request URL

●	Request Body (include encrypted + decrypted parts)

●	Response

________________________________________
9. Recharge API – Success Cases
Provide:
●	Complete cURL Request (including headers)

●	Request URL

●	Request Body (include encrypted + decrypted parts)

●	Response

________________________________________
10. Recharge API – Failed Cases
Provide:
●	Complete cURL Request (including headers)

●	Request URL

●	Request Body (include encrypted + decrypted parts)

●	Response

________________________________________
11. Recharge API – Pending Cases
Provide:
●	Complete cURL Request (including headers)

●	Request URL

●	Request Body (include encrypted + decrypted parts)

●	Response

________________________________________
12. Transaction Status Check API – Success Cases
Provide:
●	Complete cURL Request (including headers)

●	Request URL

●	Request Body (include encrypted + decrypted parts)

●	Response

________________________________________
13. Transaction Status Check API – Failed Cases
Provide:
●	Complete cURL Request (including headers)

●	Request URL

●	Request Body (include encrypted + decrypted parts)

●	Response

________________________________________
14. Transaction Status Check API – Pending Cases
Provide:
●	Complete cURL Request (including headers)

●	Request URL

●	Request Body (include encrypted + decrypted parts)

●	Response
●	

________________________________________
Additional Functional Questions
15. Handling of Pending Cases
Provide a detailed explanation of:
●	How pending transactions are identified

●	What steps your system performs after identifying pending status

●	How long the transaction remains in pending state

●	When and how retries/status checks are triggered

●	How the final status is updated in your system
 (Do not provide a 1–2 word response)

________________________________________
16. Handling of Timeout Cases
Provide a complete description of:
●	How you detect a timeout at your end

●	Your system logic after a timeout occurs

●	Whether retries or status checks are initiated

●	How you differentiate between timeout vs pending vs failed

●	How final reconciliation is performed
 (Do not provide a 1–2 word response)

________________________________________
17. Interval for Status Check on Pending/Timeout Cases
Provide a detailed explanation of:
●	The exact time interval for retry/status check

●	Number of attempts

●	Total retry duration

●	Logic behind your retry mechanism
 (Do not provide a 1–2 word response)

________________________________________
18. Handling of Token Expiry Cases
Provide a complete description of:
●	How token expiry is detected

●	How your system regenerates a token

●	How you retry the previously failed request (if applicable)

●	What fail-safes you have implemented
 (Do not provide a 1–2 word response)
