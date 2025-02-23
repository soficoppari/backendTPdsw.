import { Request, Response, NextFunction } from 'express';
import { Veterinario } from './veterinario.entity.js';
import { ORM } from '../shared/db/orm.js';
import { Horario } from '../Horario/horario.entity.js';
import { Especie } from '../Especie/especie.entity.js';
import bcrypt from 'bcrypt';
import { Calificacion } from '../Calificacion/calificacion.entity.js';

const em = ORM.em;
//date
function sanitizeVeterinarioInput(
  req: Request,
  res: Response,
  next: NextFunction
) {
  req.body.sanitizedInput = {
    id: req.body.id,
    matricula: req.body.matricula,
    nombre: req.body.nombre,
    apellido: req.body.apellido,
    direccion: req.body.direccion,
    nroTelefono: req.body.nroTelefono,
    email: req.body.email,
    contrasenia: req.body.contrasenia,
    promedio: req.body.promedio,
    horarios: req.body.horarios,
    turnos: req.body.turnos,
    especies: req.body.especies,
  };

  // Eliminar propiedades indefinidas
  Object.keys(req.body.sanitizedInput).forEach((key) => {
    if (req.body.sanitizedInput[key] === undefined) {
      delete req.body.sanitizedInput[key];
    }
  });

  next();
}

async function findAll(req: Request, res: Response) {
  try {
    // Convierte especieMascota a number
    const especie = Number(req.query.especie);
    console.log('especieMascota recibido:', especie);
    // Verifica que el especie sea un número válido
    if (isNaN(especie)) {
      return res
        .status(400)
        .json({ message: 'El tipo de mascota debe ser un ID numérico válido' });
    }

    // Busca veterinarios que contengan este tipo de mascota y carga los especies asociados
    const veterinarios = await em.find(
      Veterinario,
      {
        especies: { $in: [especie] }, // Busca veterinarios que contengan este tipo de mascota
      },
      { populate: ['especies', 'horarios'] }
    ); // Agrega el populate para incluir los especies

    res
      .status(200)
      .json({ message: 'found matching veterinarios', data: veterinarios });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
}

async function findOne(req: Request, res: Response) {
  try {
    const id = Number.parseInt(req.params.id);
    const veterinario = await em.findOneOrFail(
      Veterinario,
      { id },
      { populate: ['especies', 'horarios'] }
    );
    res.status(200).json({ message: 'found veterinario', data: veterinario });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
}

async function add(req: Request, res: Response) {
  try {
    console.log('Datos del input:', req.body.sanitizedInput);

    // Verifica si ya existe un veterinario con el mismo email
    const existingVeterinario = await em.findOne(Veterinario, {
      email: req.body.sanitizedInput.email,
    });
    if (existingVeterinario) {
      return res.status(400).json({ message: 'Email ya en uso' });
    }

    // Encriptar la contraseña
    const hashedPassword = await bcrypt.hash(
      req.body.sanitizedInput.contrasenia,
      10
    );

    // Crear instancia de Veterinario sin asignar horarios ni especies todavía
    const veterinario = em.create(Veterinario, {
      ...req.body.sanitizedInput,
      contrasenia: hashedPassword, // Usar la contraseña encriptada
      horarios: [],
      especies: [],
    });

    // Agregar horarios si están incluidos en el input
    if (req.body.sanitizedInput.horarios) {
      req.body.sanitizedInput.horarios.forEach(
        (horarioData: { dia: string; horaInicio: string; horaFin: string }) => {
          // Verificar que horaInicio y horaFin estén en el formato HH:mm
          const horaInicio = horarioData.horaInicio.trim();
          const horaFin = horarioData.horaFin.trim();

          console.log('horaInicio:', horaInicio, 'horaFin:', horaFin);

          if (
            !/^\d{2}:\d{2}$/.test(horaInicio) ||
            !/^\d{2}:\d{2}$/.test(horaFin)
          ) {
            throw new Error(
              'Los valores de horaInicio o horaFin no están en formato HH:mm'
            );
          }

          // Crear el horario con las horas en formato HH:mm
          const horario = em.create(Horario, {
            dia: horarioData.dia,
            horaInicio,
            horaFin,
            veterinario,
          });

          // Agregar el horario a la lista de horarios del veterinario
          veterinario.horarios.add(horario);
        }
      );
    }

    // Agregar especies si están incluidas en el input
    if (req.body.sanitizedInput.especies) {
      req.body.sanitizedInput.especies.forEach((especieId: number) => {
        const especie = em.getReference(Especie, especieId);
        if (especie) {
          veterinario.especies.add(especie);
        } else {
          console.warn(`Especie con ID ${especieId} no encontrada`);
        }
      });
    }

    // Persistir y guardar el veterinario junto con sus relaciones
    await em.persistAndFlush(veterinario);
    res
      .status(201)
      .json({ message: 'Veterinario creado exitosamente', data: veterinario });
  } catch (error: any) {
    console.error('Error al crear el veterinario:', error);
    res
      .status(500)
      .json({ message: error.message || 'Error al crear el veterinario' });
  }
}

async function update(req: Request, res: Response) {
  try {
    const id = Number.parseInt(req.params.id);
    const veterinarioToUpdate = await em.findOneOrFail(Veterinario, { id });
    em.assign(veterinarioToUpdate, req.body.sanitizedInput);
    await em.flush();
    res
      .status(200)
      .json({ message: 'veterinario updated', data: veterinarioToUpdate });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
}

async function remove(req: Request, res: Response) {
  try {
    const id = Number.parseInt(req.params.id);
    const veterinario = em.getReference(Veterinario, id);
    await em.removeAndFlush(veterinario);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
}

async function actualizarPromedio(veterinarioId: number) {
  const calificaciones = await em.find(Calificacion, {
    veterinario: veterinarioId,
  });
  const promedio = calificaciones.length
    ? calificaciones.reduce((sum, c) => sum + c.puntuacion, 0) /
      calificaciones.length
    : null;

  const veterinario = await em.findOne(Veterinario, { id: veterinarioId });
  if (veterinario) {
    veterinario.promedio = promedio;
    await em.persistAndFlush(veterinario);
  }
}

export {
  sanitizeVeterinarioInput,
  findAll,
  findOne,
  add,
  update,
  remove,
  actualizarPromedio,
};
