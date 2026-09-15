import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const LEMMIT_COST = 0.12;

async function saveLog(
  supabase: any,
  logData: {
    user_id?: string;
    user_email?: string;
    endpoint: string;
    method: string;
    request_body: any;
    response_body?: any;
    status_code?: number;
    success: boolean;
    error_message?: string;
    duration_ms: number;
    cost?: number;
  }
) {
  try {
    await supabase.from("api_logs").insert(logData);
  } catch (error) {
    console.error("Error saving log:", error);
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  const startTime = Date.now();
  let userId: string | undefined;
  let userEmail: string | undefined;
  let requestBody: any = {};
  let responseBody: any;
  let statusCode = 200;
  let success = false;
  let errorMessage: string | undefined;

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    const authHeader = req.headers.get("Authorization");
    if (authHeader) {
      const token = authHeader.replace("Bearer ", "");
      const { data: { user } } = await supabase.auth.getUser(token);
      if (user) {
        userId = user.id;
        userEmail = user.email;
      }
    }

    const LEMMIT_API_KEY = Deno.env.get("LEMMIT_API_KEY");

    if (!LEMMIT_API_KEY) {
      throw new Error("LEMMIT_API_KEY not configured");
    }

    requestBody = await req.json();
    const { cpf } = requestBody;

    if (!cpf) {
      statusCode = 400;
      errorMessage = "CPF é obrigatório";
      responseBody = { error: errorMessage };

      await saveLog(supabase, {
        user_id: userId,
        user_email: userEmail,
        endpoint: "lemit-consulta-pessoa",
        method: "POST",
        request_body: requestBody,
        response_body: responseBody,
        status_code: statusCode,
        success: false,
        error_message: errorMessage,
        duration_ms: Date.now() - startTime,
        cost: 0,
      });

      return new Response(
        JSON.stringify(responseBody),
        {
          status: statusCode,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const cpfLimpo = cpf.replace(/\D/g, "");

    if (cpfLimpo.length !== 11) {
      statusCode = 400;
      errorMessage = "CPF deve conter 11 dígitos";
      responseBody = { error: errorMessage };

      await saveLog(supabase, {
        user_id: userId,
        user_email: userEmail,
        endpoint: "lemit-consulta-pessoa",
        method: "POST",
        request_body: requestBody,
        response_body: responseBody,
        status_code: statusCode,
        success: false,
        error_message: errorMessage,
        duration_ms: Date.now() - startTime,
        cost: 0,
      });

      return new Response(
        JSON.stringify(responseBody),
        {
          status: statusCode,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const lemmitResponse = await fetch(
      "http://189.84.127.130:8080/webhook/5e534e38-6f87-400b-a441-821559c6c2e9",
      {
        method: "POST",
        headers: {
          "ApiKey": LEMMIT_API_KEY,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          documento: cpfLimpo,
        }),
      }
    );

    const responseData = await lemmitResponse.json();
    statusCode = lemmitResponse.status;

    if (statusCode === 404) {
      if (responseData.errors && Array.isArray(responseData.errors)) {
        errorMessage = "CPF não encontrado na base de dados";
        responseBody = {
          error: errorMessage,
          notFound: true,
          canContinue: true,
        };

        await saveLog(supabase, {
          user_id: userId,
          user_email: userEmail,
          endpoint: "lemit-consulta-pessoa",
          method: "POST",
          request_body: requestBody,
          response_body: responseBody,
          status_code: 404,
          success: false,
          error_message: errorMessage,
          duration_ms: Date.now() - startTime,
          cost: LEMMIT_COST,
        });

        if (userId) {
          await supabase.rpc('decrement_lemmit_balance', {
            user_id: userId,
            amount: LEMMIT_COST
          });
        }

        return new Response(
          JSON.stringify(responseBody),
          {
            status: 404,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }
    }

    if (statusCode === 422) {
      if (responseData.errors && responseData.errors.documento) {
        errorMessage = responseData.errors.documento[0] || "CPF inválido";
        responseBody = {
          error: errorMessage,
          invalidCPF: true,
          canContinue: true,
        };

        await saveLog(supabase, {
          user_id: userId,
          user_email: userEmail,
          endpoint: "lemit-consulta-pessoa",
          method: "POST",
          request_body: requestBody,
          response_body: responseBody,
          status_code: 422,
          success: false,
          error_message: errorMessage,
          duration_ms: Date.now() - startTime,
          cost: 0,
        });

        return new Response(
          JSON.stringify(responseBody),
          {
            status: 422,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }
    }

    if (responseData.error === "Error in workflow") {
      errorMessage = "Consulta Lemmit falhou temporariamente";
      responseBody = {
        error: errorMessage,
        workflowError: true,
        canContinue: true,
        details: responseData.details,
      };

      await saveLog(supabase, {
        user_id: userId,
        user_email: userEmail,
        endpoint: "lemit-consulta-pessoa",
        method: "POST",
        request_body: requestBody,
        response_body: responseBody,
        status_code: 500,
        success: false,
        error_message: errorMessage,
        duration_ms: Date.now() - startTime,
        cost: LEMMIT_COST,
      });

      if (userId) {
        await supabase.rpc('decrement_lemmit_balance', {
          user_id: userId,
          amount: LEMMIT_COST
        });
      }

      return new Response(
        JSON.stringify(responseBody),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    if (!lemmitResponse.ok) {
      errorMessage = responseData.message || "Erro ao consultar CPF na Lemmit";
      responseBody = {
        error: errorMessage,
        canContinue: true,
        details: responseData,
      };

      await saveLog(supabase, {
        user_id: userId,
        user_email: userEmail,
        endpoint: "lemit-consulta-pessoa",
        method: "POST",
        request_body: requestBody,
        response_body: responseBody,
        status_code: statusCode,
        success: false,
        error_message: errorMessage,
        duration_ms: Date.now() - startTime,
        cost: LEMMIT_COST,
      });

      if (userId) {
        await supabase.rpc('decrement_lemmit_balance', {
          user_id: userId,
          amount: LEMMIT_COST
        });
      }

      return new Response(
        JSON.stringify(responseBody),
        {
          status: statusCode,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    if (!responseData.pessoa || Object.keys(responseData.pessoa).length === 0) {
      errorMessage = "Dados não encontrados ou vazios na Lemmit";
      responseBody = {
        error: errorMessage,
        empty: true,
        canContinue: true,
      };

      await saveLog(supabase, {
        user_id: userId,
        user_email: userEmail,
        endpoint: "lemit-consulta-pessoa",
        method: "POST",
        request_body: requestBody,
        response_body: responseBody,
        status_code: 404,
        success: false,
        error_message: errorMessage,
        duration_ms: Date.now() - startTime,
        cost: LEMMIT_COST,
      });

      if (userId) {
        await supabase.rpc('decrement_lemmit_balance', {
          user_id: userId,
          amount: LEMMIT_COST
        });
      }

      return new Response(
        JSON.stringify(responseBody),
        {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    success = true;
    responseBody = responseData;

    if (userId) {
      await supabase.rpc('decrement_lemmit_balance', {
        user_id: userId,
        amount: LEMMIT_COST
      });
    }

    await saveLog(supabase, {
      user_id: userId,
      user_email: userEmail,
      endpoint: "lemit-consulta-pessoa",
      method: "POST",
      request_body: requestBody,
      response_body: responseBody,
      status_code: 200,
      success: true,
      duration_ms: Date.now() - startTime,
      cost: LEMMIT_COST,
    });

    return new Response(
      JSON.stringify(responseBody),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Error in lemit-consulta-pessoa:", error);
    statusCode = 500;
    errorMessage = error instanceof Error ? error.message : "Erro interno do servidor";
    responseBody = {
      error: errorMessage,
    };

    await saveLog(supabase, {
      user_id: userId,
      user_email: userEmail,
      endpoint: "lemit-consulta-pessoa",
      method: "POST",
      request_body: requestBody,
      response_body: responseBody,
      status_code: statusCode,
      success: false,
      error_message: errorMessage,
      duration_ms: Date.now() - startTime,
      cost: 0,
    });

    return new Response(
      JSON.stringify(responseBody),
      {
        status: statusCode,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
