select created_at, endpoint, success,
       request_body,
       response_body
from api_logs
where endpoint='erp-novo-usuario2'
order by created_at desc
limit 5;